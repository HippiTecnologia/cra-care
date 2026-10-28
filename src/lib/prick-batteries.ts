export type PrickBatteryGroup = {
  battery: string;
  category: string;
  items: string[];
  resultKeys?: string[];
};

const standardPrickGroups: PrickBatteryGroup[] = [
  { battery: "BATERIA A", category: "Controles", items: ["Controle Positivo", "Controle Negativo"] },
  { battery: "BATERIA A", category: "Ácaros", items: ["Blomia tropicalis", "Dermatophagoides farinae", "Dermatophagoides pteronyssinus"] },
  { battery: "BATERIA A", category: "Fungos", items: ["Fungos II: Alternaria, Cladosporium, Aspergillus, Penicillium"] },
  { battery: "BATERIA A", category: "Pólens", items: ["Gramíneas mix: Dactylis glomerata, Festuca pratensis, Lolium multiflorum, Phleum pratense, Poa pratensis"] },
  { battery: "BATERIA A", category: "Outros", items: ["Látex"] },
  { battery: "BATERIA A", category: "Epitélios", items: ["Epitélio de cão", "Epitélio de gato"] },
  { battery: "BATERIA B", category: "Insetos", items: ["Barata Mix", "Mosquito Mix"] },
  { battery: "BATERIA B", category: "Alimentos", items: ["Leite de vaca", "Ovo de galinha", "Trigo", "Crustáceos (mix): lagosta, ostra, siri, marisco", "Amendoim"] },
];

const alessandraImmunotechItems = [
  "Controle Negativo",
  "Controle Positivo",
  "Ácaros mix",
  "Epitélio de cão",
  "Epitélio de gato",
  "Penas mix",
  "Gramíneas mix",
  "Fungos mix",
  "Formiga mix",
  "Mosquito mix",
  "Barata mix",
  "Leite",
  "Ovo",
  "Trigo",
  "Soja",
  "Amendoim",
  "Peixe",
  "Camarão",
  "Pimenta",
];

const alessandraImmunotechPrickGroup: PrickBatteryGroup = {
  battery: "EXTRATO ALERGÊNICO IMMUNOTECH",
  category: "Extratos",
  items: alessandraImmunotechItems,
  resultKeys: alessandraImmunotechItems.map((item) => `Immunotech · ${item}`),
};

export function prickResultKey(group: PrickBatteryGroup, itemIndex: number) {
  return group.resultKeys?.[itemIndex] ?? group.items[itemIndex];
}

function normalizePersonName(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isAlessandraPrickDoctor(name: string, crm?: string) {
  const normalizedName = normalizePersonName(name);
  const crmDigits = (crm ?? "").replace(/\D/g, "");
  return crmDigits === "28606" || normalizedName.includes("alessandra") && normalizedName.includes("bitencourt");
}

export function getPrickGroupsForDoctor(name: string, crm?: string, includeImmunotechBattery = false): PrickBatteryGroup[] {
  if (!includeImmunotechBattery || !isAlessandraPrickDoctor(name, crm)) return standardPrickGroups;
  return [...standardPrickGroups, alessandraImmunotechPrickGroup];
}
