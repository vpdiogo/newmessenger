import { requestJson } from "./client";

export type HealthStatus = { status: string };

export async function getHealthStatus(): Promise<HealthStatus> {
  const data = await requestJson("/health");
  if (
    typeof data !== "object" ||
    data === null ||
    !("status" in data) ||
    typeof data.status !== "string"
  ) {
    throw new Error("The API health response is invalid");
  }

  return { status: data.status };
}
