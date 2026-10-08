import { NextRequest, NextResponse } from "next/server";
import { authenticatedSignatureUser } from "../../../../lib/signatures/auth";
import { listSignatureProviders } from "../../../../lib/signatures/providers";

export async function GET(request: NextRequest) {
  const user = await authenticatedSignatureUser(request);
  if (!user) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  return NextResponse.json({ providers: listSignatureProviders() });
}
