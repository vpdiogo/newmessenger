export type HealthStatus = { status: string };

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export async function getHealthStatus(): Promise<HealthStatus> {
  const response = await fetch(`${apiBaseUrl}/health`);
  if (!response.ok) {
    throw new Error("The API health check failed");
  }

  const data: unknown = await response.json();
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
