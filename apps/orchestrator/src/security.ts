import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyGithubSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const givenBuffer = Buffer.from(signatureHeader, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (givenBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(givenBuffer, expectedBuffer);
}
