/// <reference types="vite/client" />
import type { MacNotesApi } from '../shared/types';

declare global {
  interface Window {
    macnotes?: MacNotesApi;
  }
}

export {};
