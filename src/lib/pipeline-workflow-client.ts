type WorkflowResponse = {
  error?: string;
};

export async function postProjectWorkflow<
  T extends WorkflowResponse = WorkflowResponse,
>(
  projectId: string,
  body: Record<string, unknown>,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(
    `/api/projects/${projectId}/workflow`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(payload.error ?? fallbackError);
  }
  return payload;
}
