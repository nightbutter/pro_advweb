// โซนจัดส่ง (ต้องตรงกับ server/model/zones.ts)
export const ZONES = ['ขามเรียง', 'ท่าขอนยาง', 'หน้าป้าย'] as const;
export type Zone = (typeof ZONES)[number];
