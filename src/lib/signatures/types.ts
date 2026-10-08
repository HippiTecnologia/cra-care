export type SignatureStatus =
  | "draft"
  | "awaiting_signature"
  | "authentication_pending"
  | "signing"
  | "signed"
  | "rejected"
  | "cancelled"
  | "expired"
  | "error"
  | "invalid";

export type CertificateType = "a1" | "a3" | "cloud";
export type SignatureProviderKey = "vidaas" | "soluti" | "a1" | "a3" | "cloud" | "sandbox";

export type SignatureUser = {
  id: string;
  clinicId: string;
  role: "medico" | "secretaria" | "admin" | "super_admin";
  fullName: string;
  crm?: string;
};

export type ProviderStartContext = {
  signatureId: string;
  documentHash: string;
  signer: SignatureUser;
  callbackUrl: string;
};

export type ProviderStartResult =
  | { kind: "redirect"; authorizationUrl: string; state: string; verifier?: string; expiresAt: string }
  | { kind: "connector"; message: string }
  | { kind: "unavailable"; message: string };

export interface SignatureProvider {
  readonly key: SignatureProviderKey;
  readonly label: string;
  readonly certificateTypes: readonly CertificateType[];
  isConfigured(): boolean;
  start(context: ProviderStartContext): Promise<ProviderStartResult>;
}

export const signatureStatusLabels: Record<SignatureStatus, string> = {
  draft: "Rascunho",
  awaiting_signature: "Aguardando assinatura",
  authentication_pending: "Autenticação pendente",
  signing: "Assinando",
  signed: "Assinado",
  rejected: "Assinatura recusada",
  cancelled: "Cancelado",
  expired: "Expirado",
  error: "Erro",
  invalid: "Assinatura inválida",
};
