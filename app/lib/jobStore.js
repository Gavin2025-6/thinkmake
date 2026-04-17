// Shared in-memory job status store.
// Works within a single Railway server process.
// status values: 'pending' | 'sent' | 'failed'
export const jobs = new Map()
