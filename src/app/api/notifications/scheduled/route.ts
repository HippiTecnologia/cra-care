import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";

type Actor = { admin: any; clinicId: string; userId: string; fullName: string };

async function getSecretaryActor(request: NextRequest): Promise<Actor | NextResponse> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 });
  try {
    const admin: any = getSupabaseAdminClient();
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const { data: profile, error } = await admin.from("profiles")
      .select("id, clinic_id, role, full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (error || profile?.role !== "secretaria" || !profile.clinic_id) {
      return NextResponse.json({ error: "Apenas a Secretaria pode gerenciar notificações." }, { status: 403 });
    }
    return { admin, clinicId: profile.clinic_id, userId: user.id, fullName: profile.full_name || "Secretaria" };
  } catch {
    return NextResponse.json({ error: "Não foi possível validar a sessão." }, { status: 500 });
  }
}

function isResponse(value: Actor | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

function notificationShape(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    icon: row.icon,
    scheduledFor: row.scheduled_for,
    status: row.status,
    recipientCount: Array.isArray(row.patient_ids) ? row.patient_ids.length : 0,
    sentPatientCount: row.sent_patient_count ?? 0,
    pushSentCount: row.push_sent_count ?? 0,
    lastError: row.last_error ?? null,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
  };
}

async function isDispatcherReady(admin: any) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  try {
    const { data, error } = await admin.rpc("cra_care_scheduled_notifications_ready", { p_expected_secret: secret });
    return !error && data === true;
  } catch {
    return false;
  }
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function GET(request: NextRequest) {
  const actor = await getSecretaryActor(request);
  if (isResponse(actor)) return actor;
  const { data, error } = await actor.admin.from("scheduled_patient_notifications")
    .select("id, title, message, icon, scheduled_for, status, patient_ids, sent_patient_count, push_sent_count, last_error, created_at, created_by_name")
    .eq("clinic_id", actor.clinicId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Não foi possível carregar os agendamentos." }, { status: 500 });
  const schedulingReady = await isDispatcherReady(actor.admin);
  return NextResponse.json({ notifications: (data ?? []).map(notificationShape), schedulingReady }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const actor = await getSecretaryActor(request);
  if (isResponse(actor)) return actor;
  if (!(await isDispatcherReady(actor.admin))) {
    return NextResponse.json({ error: "O envio programado ainda não está ativado no Supabase. Envie agora ou conclua a configuração do agendador." }, { status: 503 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const icon = typeof body.icon === "string" ? body.icon.trim().slice(0, 12) : "📣";
    const patientIds = Array.isArray(body.patientIds)
      ? Array.from(new Set(body.patientIds.filter((id): id is string => typeof id === "string" && id.length <= 64)))
      : [];
    const scheduledFor = typeof body.scheduledFor === "string" ? new Date(body.scheduledFor) : null;
    if (!title || title.length > 120 || !message || message.length > 3000 || !patientIds.length || patientIds.length > 2000 || !scheduledFor || !Number.isFinite(scheduledFor.getTime())) {
      return NextResponse.json({ error: "Confira o título, a mensagem, os destinatários e o horário." }, { status: 400 });
    }
    if (scheduledFor.getTime() < Date.now() + 2 * 60_000) {
      return NextResponse.json({ error: "Escolha um horário pelo menos 2 minutos à frente." }, { status: 400 });
    }
    const validIds: string[] = [];
    for (const patientIdChunk of chunks(patientIds, 200)) {
      const { data: patients, error: patientError } = await actor.admin.from("patients")
        .select("id")
        .eq("clinic_id", actor.clinicId)
        .is("archived_at", null)
        .in("id", patientIdChunk);
      if (patientError) throw patientError;
      validIds.push(...(patients ?? []).map((patient: { id: string }) => patient.id));
    }
    if (validIds.length !== patientIds.length) {
      return NextResponse.json({ error: "Um ou mais pacientes não estão ativos nesta clínica. Atualize a lista e tente novamente." }, { status: 400 });
    }
    const { data, error } = await actor.admin.from("scheduled_patient_notifications")
      .insert({
        clinic_id: actor.clinicId,
        created_by: actor.userId,
        created_by_name: actor.fullName,
        patient_ids: validIds,
        icon: icon || "📣",
        title,
        message,
        scheduled_for: scheduledFor.toISOString(),
      })
      .select("id, title, message, icon, scheduled_for, status, patient_ids, sent_patient_count, push_sent_count, last_error, created_at, created_by_name")
      .single();
    if (error) throw error;
    return NextResponse.json({ notification: notificationShape(data) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Não foi possível salvar o agendamento." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const actor = await getSecretaryActor(request);
  if (isResponse(actor)) return actor;
  if (!(await isDispatcherReady(actor.admin))) {
    return NextResponse.json({ error: "O envio programado ainda não está ativado no Supabase." }, { status: 503 });
  }
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") return NextResponse.json({ error: "Agendamento inválido." }, { status: 400 });
    const { data, error } = await actor.admin.from("scheduled_patient_notifications")
      .update({ status: "pending", scheduled_for: new Date(Date.now() + 2 * 60_000).toISOString(), attempts: 0, last_error: null, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("clinic_id", actor.clinicId)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Este agendamento não está disponível para nova tentativa." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível tentar novamente." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await getSecretaryActor(request);
  if (isResponse(actor)) return actor;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Agendamento inválido." }, { status: 400 });
  const { data, error } = await actor.admin.from("scheduled_patient_notifications")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", actor.clinicId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Não foi possível cancelar." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Este agendamento já está sendo enviado ou não está mais pendente." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
