// Specialties are the prefixes of the group names (TI-251 → TI, FAF-232 → FAF).

export const specialtyOf = (groupName: string) => groupName.split('-')[0].trim().toUpperCase();
