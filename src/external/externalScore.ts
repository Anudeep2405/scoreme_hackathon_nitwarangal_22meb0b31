export async function getExternalScore(): Promise<{ score: number }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 20% failure rate
  const isFailure = Math.random() < 0.2;

  if (isFailure) {
    throw new Error("External service unavailable");
  }

  // Return a score between 300 and 850
  return {
    score: Math.floor(Math.random() * (850 - 300 + 1) + 300),
  };
}
