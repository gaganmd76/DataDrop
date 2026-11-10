// Curated list of friendly, distinct words for readable drop keys
const ADJECTIVES = [
  'blue',
  'red',
  'green',
  'amber',
  'silver',
  'golden',
  'coral',
  'teal',
  'swift',
  'calm',
  'bold',
  'bright',
  'silent',
  'cosmic',
  'polar',
  'cedar',
  'frost',
  'noble',
];

const NOUNS = [
  'tiger',
  'falcon',
  'otter',
  'badger',
  'panda',
  'hawk',
  'dolphin',
  'wolf',
  'lynx',
  'bear',
  'fox',
  'raven',
  'comet',
  'orbit',
  'harbor',
  'glacier',
  'beacon',
  'sparrow',
];

/**
 * Generates a memorable, human-friendly key suggestion like "blue-tiger-42"
 */
export function generateKeySuggestion(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${adj}-${noun}-${num}`;
}

/**
 * Generates a clean, readable random password meeting the 6+ char requirement.
 * Uses a mix of lowercase, uppercase, and numbers avoiding easily confused chars (like 0/O, 1/l).
 */
export function generatePassword(): string {
  const chars = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
