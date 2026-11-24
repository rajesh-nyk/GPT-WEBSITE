/**
 * Everything the chapters say, in one place. Wording, dates and places are taken from
 * the current live site (~/wedding, website-3) — the couple's own copy.
 */

export type ChapterId =
  | 'hero'
  | 'blessing'
  | 'story'
  | 'nirbandha'
  | 'bahaghara'
  | 'kaudi'
  | 'reception'
  | 'night'

/** The eight spokes of the wheel, in order. */
export const CHAPTERS: { id: ChapterId; label: string }[] = [
  { id: 'hero', label: 'Arrival' },
  { id: 'blessing', label: 'Blessing' },
  { id: 'story', label: 'Our Story' },
  { id: 'nirbandha', label: 'Nirbandha' },
  { id: 'bahaghara', label: 'Bahaghara' },
  { id: 'kaudi', label: 'Rituals' },
  { id: 'reception', label: 'Reception' },
  { id: 'night', label: 'Shubha Bibaha' },
]

/**
 * Pages are unlocked one by one while we work (Rajesh, 22 Nov 2026): only the first
 * UNLOCKED_PAGES chapters are shown; the rest are hidden until he unlocks them.
 */
export const UNLOCKED_PAGES = 3
/**
 * While we design page 3 (Rajesh, 22 Nov 2026) the approved pages 1 and 2 are hidden too,
 * and the site opens straight on page 3. Set true to bring them back exactly as approved.
 */
export const SHOW_LOCKED_PAGES = true
export const VISIBLE_CHAPTERS = CHAPTERS.slice(0, UNLOCKED_PAGES)

export const STORY = [
  { kicker: 'The Matchmaker', text: 'It began with a little matchmaking — a girl he had never met was trying to set him up with her friend.', photo: 'story/m1.webp', w: 1087, h: 1447, alt: 'Rajesh and Chinmayee in festive clothes, smiling at the camera' },
  { kicker: 'Between the Messages', text: 'But somewhere between the messages, he found himself falling for the matchmaker instead.', photo: 'story/m2.webp', w: 1086, h: 1448, alt: 'Rajesh and Chinmayee at night in front of a lit golden temple' },
  { kicker: 'The Moment', text: 'The moment he finally saw her, he just knew — she was the one.', photo: 'story/m3.webp', w: 1087, h: 1447, alt: 'A close selfie of Rajesh and Chinmayee at night' },
  { kicker: 'Written Long Before', text: 'And when we told our families, they said yes without a single question — as if it had been written long before we ever met.', photo: 'story/m4.webp', w: 1086, h: 1448, alt: 'Chinmayee taking a selfie with Rajesh beside a pool' },
] as const

export const STORY_CLOSING = [
  { photo: 'story/m5.webp', w: 1672, h: 941, alt: 'Rajesh and Chinmayee standing together in a courtyard' },
  { photo: 'story/m6.webp', w: 825, h: 1100, alt: 'Their hands together, wearing matching watches' },
] as const

export type Ceremony = {
  id: 'nirbandha' | 'bahaghara' | 'reception'
  n: string
  name: string
  odia?: string
  en: string
  desc: string
  date: string
  dateShort: string
  /** Hero date line, e.g. '27 Jan', and the machine-readable date. */
  dayMonth: string
  iso: string
  place: string
}

export const CEREMONIES: Record<Ceremony['id'], Ceremony> = {
  nirbandha: {
    id: 'nirbandha', n: '01', name: 'Nirbandha', odia: 'ନିର୍ବନ୍ଧ', en: 'The Engagement',
    desc: 'The families meet, the promise is made, and the date is sealed with blessings.',
    date: 'Wednesday, 27 January 2027', dateShort: '27.01', dayMonth: '27 Jan', iso: '2027-01-27', place: 'Sambalpur, Odisha',
  },
  bahaghara: {
    id: 'bahaghara', n: '02', name: 'Bahaghara', odia: 'ବାହାଘର', en: 'The Wedding',
    desc: 'Drums, fire and mango leaves — the day two families become one.',
    date: 'Friday, 26 February 2027', dateShort: '26.02', dayMonth: '26 Feb', iso: '2027-02-26', place: 'Sambalpur, Odisha',
  },
  reception: {
    id: 'reception', n: '03', name: 'Reception', en: 'An evening of Odia flavours with family & friends',
    desc: 'An evening of Odia flavours, music and laughter with family and friends.',
    date: 'Wednesday, 3 March 2027', dateShort: '03.03', dayMonth: '3 Mar', iso: '2027-03-03', place: 'Bhubaneswar, Odisha',
  },
}

export const HATA_GANTHI = {
  odia: 'ହାତଗଣ୍ଠି',
  name: 'Hata Ganthi',
  lines: ['Two families blossom into one.', 'Her palm is placed upon his.', 'Tied together — the sacred knot.'],
}

export const RITUALS = [
  { step: 'First', name: 'Barajatri', odia: 'ବରଯାତ୍ରୀ', text: "The groom and his family arrive at the wedding venue in a grand, celebratory procession and are welcomed by the bride's family." },
  { step: 'Then', name: 'Kanyadana', odia: 'କନ୍ୟାଦାନ', text: "The father places his daughter's hand in the groom's hand, formally giving her away." },
  { step: 'Then', name: 'Hasta Granthi & Lajahoma', odia: 'ହସ୍ତଗ୍ରନ୍ଥି', text: "Instead of the usual pheras, the couple's hands are tied together with mango leaves, and together they offer puffed rice and sacred grains into the holy fire." },
  { step: 'Then', name: 'Kaudi Khela', odia: 'କଉଡ଼ି ଖେଳ', text: 'A fun game: the bride holds a sacred cowrie shell (kaudi) tightly in her fist, and the groom must pry it open using only his little finger.' },
  { step: 'Then', name: 'Sala Bidha', odia: 'ଶଳା ବିଧା', text: "A lighthearted moment — the bride's brother gives the groom a playful punch on the back, a reminder to take good care of his sister." },
  { step: 'Finally', name: 'Sasu Dahi Pakhala Khia', odia: 'ଶାଶୂ ଦହି ପଖାଳ ଖିଆ', text: "The groom sits on his mother-in-law's lap and is playfully fed curd-rice (dahi pakhala) by her." },
] as const

export const FINALE = {
  lines: ['As the sun sets over Sambalpur…', '…and the first lanterns rise, two stories become one.'],
  odia: 'ଶୁଭ ବିବାହ',
  title: 'Shubha Bibaha',
  names: 'Rajesh Nayak & Chinmayee Patel',
  namesOdia: 'ରାଜେଶ ନାୟକ ଓ ଚିନ୍ମୟୀ ପଟେଲ',
  rajeshOdia: 'ରାଜେଶ',
  chinmayeeOdia: 'ଚିନ୍ମୟୀ',
  madeIn: 'Made with love in Bengaluru',
  email: 'rajeshnayakabcd@gmail.com',
  instagram: { handle: '@genhu_____1509', url: 'https://instagram.com/genhu_____1509' },
}
