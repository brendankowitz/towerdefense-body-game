import { Capacitor } from '@capacitor/core';
import { LocalStorageProgressRepository } from './LocalStorageProgressRepository';
import { PreferencesProgressRepository } from './PreferencesProgressRepository';
import type { ProgressRepository } from './ProgressRepository';

export function createProgressRepository(): ProgressRepository {
  return Capacitor.isNativePlatform()
    ? new PreferencesProgressRepository()
    : new LocalStorageProgressRepository();
}
