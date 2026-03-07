import api from "./instance";

// --- Settings ---
export interface SettingItem {
  key: string;
  value: string;
  description: string;
}

export const getSettings = () =>
  api.get<SettingItem[]>("/settings/").then((r) => r.data);

export const updateSetting = (key: string, value: string) =>
  api.put<SettingItem>(`/settings/${key}`, { value }).then((r) => r.data);

export const bulkUpdateSettings = (settings: Record<string, string>) =>
  api.put<SettingItem[]>("/settings/", { settings }).then((r) => r.data);

export const getCampaignDefaults = () =>
  api.get<SettingItem[]>("/settings/").then((r) => {
    const items = r.data;
    const lookup: Record<string, string> = {};
    items.forEach((s) => {
      lookup[s.key] = s.value;
    });
    return {
      position: lookup["default_position"] || "",
      framework: lookup["default_framework"] || "passion",
      my_strength: lookup["default_my_strength"] || "",
      audience_value: lookup["default_audience_value"] || "",
    };
  });
