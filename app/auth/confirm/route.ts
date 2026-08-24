import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const successUrl = request.nextUrl.clone();
  successUrl.pathname = "/auth/confirmed";
  successUrl.search = "";

  const errorUrl = request.nextUrl.clone();
  errorUrl.pathname = "/auth/confirmation-error";
  errorUrl.search = "";

  if (!tokenHash || !type) {
    return NextResponse.redirect(errorUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    return NextResponse.redirect(errorUrl);
  }

  return NextResponse.redirect(successUrl);
}
