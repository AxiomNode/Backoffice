import { getConfigValue } from "../../runtimeConfig";

export const ADMIN_DEV_UID = getConfigValue("VITE_ADMIN_DEV_UID", "admin-dev-uid") ?? "admin-dev-uid";
