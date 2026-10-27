import { Zone } from '../model/zones';

// Sample dorm customers, 20 per delivery zone.
// Dorm names are sample data. Coordinates are placed inside each zone's real area
// (based on OpenStreetMap: บ้านท่าขอนยาง 16.2348,103.2660 / บ้านขามเรียง 16.2529,103.2329 /
// มมส. campus 16.2470,103.2505), not the exact location of a real building.
// To use exact positions, edit lat/lng here or move the pin on the customers page.

interface DormSeed {
  dorm: string;
  zone: Zone;
  lat: number;
  lng: number;
}

// Deterministic spread of points around a zone centre so every reseed gives the same map
function spread(names: string[], zone: Zone, centerLat: number, centerLng: number, radiusLat: number, radiusLng: number): DormSeed[] {
  const golden = Math.PI * (3 - Math.sqrt(5)); // sunflower layout: even, non-overlapping spacing
  return names.map((dorm, i) => {
    const r = Math.sqrt((i + 0.5) / names.length);
    const theta = i * golden;
    return {
      dorm,
      zone,
      lat: Number((centerLat + r * radiusLat * Math.sin(theta)).toFixed(6)),
      lng: Number((centerLng + r * radiusLng * Math.cos(theta)).toFixed(6))
    };
  });
}

// ท่าขอนยาง: around บ้านท่าขอนยาง, south-east of campus (city side, bus lines B/C)
const THA_KHON_YANG = spread([
  'หอพัก The Iris (ดิ ไอริส)',
  'หอพัก V-Home (วีโฮม)',
  'หอพัก Green Park (กรีนปาร์ค)',
  'หอพัก Baan Chonlada (บ้านชลลดา)',
  'หอพัก Baan Rim Nam (บ้านริมน้ำ)',
  'หอพัก NP Mansion (เอ็นพี แมนชั่น)',
  'หอพัก K-Park Place (เคปาร์ค เพลส)',
  'หอพัก Siri Place (ศิริ เพลส)',
  'หอพัก The Grand Residence (เดอะ แกรนด์ เรสซิเดนซ์)',
  'หอพัก Baan Suan Rim Nam (บ้านสวนริมน้ำ)',
  'หอพัก PK Apartment (พีเค อพาร์ทเม้นท์)',
  'หอพัก Thanaporn (ธนพร หอพัก)',
  'หอพัก Tonnam Apartment (ต้นน้ำ อพาร์ทเม้นท์)',
  'หอพัก Supalai Place (ศุภาลัย เพลส)',
  'หอพัก Ruamjai Residence (ร่วมใจ เรสซิเดนซ์)',
  'หอพัก Phichitra Place (พิจิตรา เพลส)',
  'หอพัก Baan Sukjai (บ้านสุขใจ)',
  'หอพัก Thanaphon Mansion (ธนพล แมนชั่น)',
  'หอพัก Thara Resort (ธารา รีสอร์ท)',
  'หอพัก Baan Tonmai (บ้านต้นไม้)'
], 'ท่าขอนยาง', 16.2360, 103.2635, 0.0050, 0.0060);

// ขามเรียง: around บ้านขามเรียง, north-west of campus (quiet village side)
const KHAM_RIANG = spread([
  'หอพัก U-Sabai (อยู่สบาย)',
  'หอพัก The Palm Residence (เดอะ ปาล์ม เรสซิเดนซ์)',
  'หอพัก Baan Phukhao (บ้านภูเขา)',
  'หอพัก Malee Apartment (มาลี อพาร์ทเม้นท์)',
  'หอพัก Baan Srikham (บ้านศรีขาม)',
  'หอพัก Khamriang Park (ขามเรียง ปาร์ค)',
  'หอพัก Baan Suan Khun Yai (บ้านสวนคุณยาย)',
  'หอพัก The Nest (เดอะ เนสท์)',
  'หอพัก Baan Chatchawan (บ้านชัชวาลย์)',
  'หอพัก Phosri Apartment (โพธิ์ศรี อพาร์ทเม้นท์)',
  'หอพัก Supaporn Place (สุภาพร เพลส)',
  'หอพัก Baan Supannee (บ้านสุพรรณี)',
  'หอพัก Ploy Resort (พลอย รีสอร์ท)',
  'หอพัก Baan Khamriang View (บ้านขามเรียงวิว)',
  'หอพัก Grand Khamriang (แกรนด์ ขามเรียง)',
  'หอพัก Baan Saeng Tawan (บ้านแสงตะวัน)',
  'หอพัก Smile Mansion (สไมล์ แมนชั่น)',
  'หอพัก Baan Phanthip (บ้านพันทิพย์)',
  'หอพัก Suksomboon Place (สุขสมบูรณ์ เพลส)',
  'หอพัก Baan Rim Klong (บ้านริมคลอง)'
], 'ขามเรียง', 16.2525, 103.2375, 0.0045, 0.0055);

// หน้าป้าย / หน้า ม.: east edge of campus, walking distance to the main gate
const NA_PAI = spread([
  'หอพัก The Letter (เดอะ เล็ตเตอร์)',
  'หอพัก U-Center (ยู เซ็นเตอร์)',
  'หอพัก The Corner (เดอะ คอร์เนอร์)',
  'หอพัก Baan Na Mo (บ้านหน้ามอ)',
  'หอพัก The Space (เดอะ สเปซ)',
  'หอพัก Campus Place (แคมปัส เพลส)',
  'หอพัก Smart Place (สมาท เพลส)',
  'หอพัก Smile Condominium (สไมล์ คอนโด)',
  'หอพัก The Loft (เดอะ ลอฟท์)',
  'หอพัก Baan Thanaphat (บ้านธนภัทร)',
  'หอพัก Baan Kanyarat (บ้านกันยารัตน์)',
  'หอพัก Front Walk (ฟรอนท์ วอล์ค)',
  'หอพัก City Home (ซิตี้ โฮม)',
  'หอพัก Baan Phonsawan (บ้านพรสวรรค์)',
  'หอพัก Next Station (เน็กซ์ สเตชั่น)',
  'หอพัก Baan Pimchanok (บ้านพิมพ์ชนก)',
  'หอพัก The Room หน้ามอ (เดอะ รูม)',
  'หอพัก Baan Supatra (บ้านสุพัตรา)',
  'หอพัก Inter Place (อินเตอร์ เพลส)',
  'หอพัก Baan Suan Prapai (บ้านสวนประไพ)'
], 'หน้าป้าย', 16.2455, 103.2580, 0.0035, 0.0030);

const ZONE_LABEL: Record<Zone, string> = {
  'ท่าขอนยาง': 'ต.ท่าขอนยาง อ.กันทรวิชัย',
  'ขามเรียง': 'ต.ขามเรียง อ.กันทรวิชัย',
  'หน้าป้าย': 'หน้าป้าย มมส. ต.ขามเรียง'
};

// One customer (resident) per dorm; phone numbers are placeholders
export const SAMPLE_CUSTOMERS = [...THA_KHON_YANG, ...KHAM_RIANG, ...NA_PAI].map((d, i) => ({
  name: `ลูกค้า ${d.dorm.replace(/^หอพัก /, '').replace(/ \(.*\)$/, '')}`,
  phone: `080-000-${(i + 1).toString().padStart(4, '0')}`,
  address: `${d.dorm} ${ZONE_LABEL[d.zone]}`,
  lat: d.lat,
  lng: d.lng,
  zone: d.zone
}));
