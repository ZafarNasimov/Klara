// Fixed seed ids (client-safe). The seed and the role switcher share them.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const IDS = {
  company: id(1),
  project: id(10),
  contactBauherr: id(101),
  contactArchitekt: id(102),
  contactTrockenbau: id(103),
  contactBodenbelag: id(104),
  tradeElektro: id(201),
  tradeTrockenbau: id(202),
  tradeEstrich: id(203),
  tradeBodenbelag: id(204),
  teamEstrich: id(301),
  teamAusbau: id(302),
  userPolierEstrich: id(401),
  userPolierAusbau: id(402),
  userBauleiter: id(403),
  userBuero: id(404),
  schedElektro2: id(501),
  schedElektro3: id(502),
  schedEstrich2: id(503),
  schedTrockenbau2: id(504),
  schedBodenbelag2: id(505),
  progressEstrich2: id(601),
  meetingKw46: id(701),
  meetingKw47: id(702),
} as const;

