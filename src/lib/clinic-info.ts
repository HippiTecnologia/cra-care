export const clinicContact = {
  address: process.env.NEXT_PUBLIC_CLINIC_ADDRESS?.trim() || "Av. Rep. Argentina, 2069 - Água Verde, Curitiba - PR, 80620-010",
  phone: process.env.NEXT_PUBLIC_CLINIC_PHONE?.trim() || "(41) 3093-9796",
  whatsapp: process.env.NEXT_PUBLIC_CLINIC_WHATSAPP?.trim() || "(41) 9991-5590",
  email: process.env.NEXT_PUBLIC_CLINIC_EMAIL?.trim() || "contato@ipocentroderinite.com.br",
};

export const sublingualUseInstructions =
  "Aplicar embaixo da língua e deixar agir por 2 minutos antes de engolir. Após o uso, manter de 30 a 40 minutos de jejum.";
