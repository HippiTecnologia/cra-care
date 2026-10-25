import { createPkce, getVidaasConfig, vidaasAuthorizationUrl } from "./vidaas";
import { certillionAuthorizationUrl, createCertillionPkce, getCertillionConfig, isCertillionConfigured } from "./certillion";
import type { ProviderStartResult, SignatureProvider, SignatureProviderKey } from "./types";

class VidaasProvider implements SignatureProvider {
  readonly key = "vidaas" as const;
  readonly label = "VIDaaS";
  readonly certificateTypes = ["cloud"] as const satisfies readonly ["cloud"];
  isConfigured() {
    return Boolean(process.env.VIDAAS_CLIENT_ID && process.env.VIDAAS_CLIENT_SECRET && process.env.VIDAAS_REDIRECT_URI);
  }
  async start(): Promise<ProviderStartResult> {
    if (!this.isConfigured()) return { kind: "unavailable", message: "Integração VIDaaS pendente de configuração." };
    const config = getVidaasConfig();
    const pkce = createPkce();
    return { kind: "redirect", authorizationUrl: vidaasAuthorizationUrl(config, pkce), state: pkce.state, verifier: pkce.verifier, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  }
}

class PendingProvider implements SignatureProvider {
  constructor(
    readonly key: SignatureProviderKey,
    readonly label: string,
    readonly certificateTypes: Array<"a1" | "a3" | "cloud">,
    private readonly requiredEnv: string,
    private readonly connectorMessage: string,
  ) {}
  isConfigured() { return this.key !== "a1" && Boolean(process.env[this.requiredEnv]); }
  async start(): Promise<ProviderStartResult> {
    if (!this.isConfigured()) return { kind: "unavailable", message: `Integração ${this.label} pendente de configuração.` };
    return { kind: "connector", message: this.connectorMessage };
  }
}

class CertillionA3Provider implements SignatureProvider {
  readonly key = "a3" as const;
  readonly label = "Certillion (A3)";
  readonly certificateTypes = ["a3"] as const satisfies readonly ["a3"];
  isConfigured() { return isCertillionConfigured(); }
  async start(): Promise<ProviderStartResult> {
    if (!this.isConfigured()) return { kind: "unavailable", message: "Integração Certillion A3 pendente de configuração segura no servidor." };
    const config = getCertillionConfig();
    const pkce = createCertillionPkce();
    return {
      kind: "redirect", authorizationUrl: certillionAuthorizationUrl(config, pkce),
      state: pkce.state, verifier: pkce.verifier,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }
}

const providers: Record<SignatureProviderKey, SignatureProvider> = {
  vidaas: new VidaasProvider(),
  soluti: new PendingProvider("soluti", "Soluti Bird ID", ["cloud"], "SOLUTI_INTEGRATION_ENABLED", "Abra o autorizador oficial Soluti configurado para concluir a assinatura."),
  a1: new PendingProvider("a1", "Certificado A1", ["a1"], "A1_CONNECTOR_ENABLED", "Utilize o conector A1 homologado instalado no computador do médico."),
  a3: new CertillionA3Provider(),
  cloud: new PendingProvider("cloud", "Certificado em nuvem", ["cloud"], "CLOUD_SIGNATURE_ENABLED", "Autorize a assinatura no aplicativo oficial do provedor."),
  sandbox: new PendingProvider("sandbox", "Sandbox", ["cloud"], "SIGNATURE_SANDBOX_ENABLED", "Sandbox disponível somente para desenvolvimento; nenhum documento será marcado como assinado."),
};

export function getSignatureProvider(key: string) {
  return providers[key as SignatureProviderKey] ?? null;
}

export function listSignatureProviders() {
  return Object.values(providers).filter((provider) => provider.key === "a3").map((provider) => ({
    key: provider.key,
    label: provider.label,
    certificateTypes: [...provider.certificateTypes],
    configured: provider.isConfigured(),
  }));
}
