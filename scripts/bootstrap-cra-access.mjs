import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const laboratoryPassword = process.env.LABORATORY_INITIAL_PASSWORD;

if (!url || !serviceRoleKey) {
  throw new Error("Inclua NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.local antes de continuar.");
}

if (!laboratoryPassword) {
  throw new Error("Inclua LABORATORY_INITIAL_PASSWORD no arquivo .env.local antes de continuar.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const accounts = [
  { fullName: "Patricia Martinski", username: "adm.centroderinite", role: "admin", password: "1234", mustChangePassword: true },
  { fullName: "Secretaria Centro de Rinite e Alergia", username: "sec.centroderinite", role: "secretaria", password: "1234", mustChangePassword: true },
  { fullName: "Duo Extratos", username: "duo.extratos", role: "laboratorio", password: laboratoryPassword, mustChangePassword: false },
  { fullName: "Alessandra Bitencourt Schambeck", username: "alessandra.bitencourt", role: "medico", crm: "28606", specialty: "Alergista e Imunologista" },
  { fullName: "Ana Claudia Dias de Oliveira", username: "ana.dias", role: "medico", crm: "32713", specialty: "Otorrinolaringologia" },
  { fullName: "Ana Claudia Leite Azevedo", username: "ana.leite", role: "medico", crm: "44303", specialty: "Otorrinolaringologia / Alergista e Imunologista" },
  { fullName: "Caroline Fernandes Rimoli", username: "caroline.fernandes", role: "medico", crm: "37657", specialty: "Otorrinolaringologia" },
  { fullName: "Flavio Massao Mizoguchi", username: "flavio.massao", role: "medico", crm: "24603", specialty: "Otorrinolaringologia" },
  { fullName: "Patricia Cristina Scarabotto", username: "patricia.scarabotto", role: "medico", crm: "39370", specialty: "Otorrinolaringologia" },
  { fullName: "Patricia Martinski", username: "patricia.martinski", role: "medico", crm: "17877", specialty: "Dermatologista" },
  { fullName: "Paulo da Veiga Ferreira Mendes Junior", username: "paulo.ferreira", role: "medico", crm: "22667", specialty: "Otorrinolaringologia" },
  { fullName: "Renata Vecentin Becker", username: "renata.vecentin", role: "medico", crm: "30834", specialty: "Otorrinolaringologia" },
  { fullName: "Sergio Fabricio Maniglia", username: "sergio.maniglia", role: "medico", crm: "20762", specialty: "Otorrinolaringologia" },
  { fullName: "Thanara Pruner da Silva", username: "thanara.pruner", role: "medico", crm: "25827", specialty: "Otorrinolaringologia" },
];

function emailFor(username) {
  return `${username.toLowerCase()}@login.cra-care.local`;
}

const { data: clinic, error: clinicError } = await supabase
  .from("clinics")
  .select("id")
  .eq("slug", "cra-care")
  .single();

if (clinicError || !clinic) {
  throw new Error("Não foi possível localizar a clínica CRA Care no Supabase.");
}

const { data: listedUsers, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (usersError) throw usersError;

const existingByEmail = new Map(listedUsers.users.map((user) => [user.email, user]));

for (const account of accounts) {
  const email = emailFor(account.username);
  let user = existingByEmail.get(email);
  const password = account.password ?? account.crm;

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: account.username, role: account.role },
    });
    if (error || !data.user) throw new Error(`${account.username}: ${error?.message ?? "falha ao criar usuário"}`);
    user = data.user;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { username: account.username, role: account.role },
    });
    if (error) throw new Error(`${account.username}: ${error.message}`);
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    clinic_id: clinic.id,
    role: account.role,
    full_name: account.fullName,
    crm: account.crm ?? null,
    specialty: account.specialty ?? null,
    username: account.username,
    must_change_password: account.mustChangePassword,
  });
  if (profileError) throw new Error(`${account.username}: ${profileError.message}`);

  console.log(`✓ ${account.username} (${account.role})`);
}

console.log("\nAcessos iniciais criados com sucesso.");
