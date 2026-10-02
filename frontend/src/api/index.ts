import { createHttpApi } from './http';
import { createMockApi } from './mock';
import type { Api } from './types';

export const API_MODE = (import.meta.env.VITE_API_MODE ?? 'mock') as 'mock' | 'http';

export const api: Api = API_MODE === 'http' ? createHttpApi(import.meta.env.VITE_API_URL ?? '/api') : createMockApi();

export * from './types';
export { ApiError } from './http';
