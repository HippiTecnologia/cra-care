import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser } from "../../../../../lib/signatures/auth";

export async function POST(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  return NextResponse.json({ error: "O Hippi A1 foi substituído pela Certillion via VIDaaS. Use Conectar VIDaaS na tela Assinatura Digital." }, { status: 410 });
}
