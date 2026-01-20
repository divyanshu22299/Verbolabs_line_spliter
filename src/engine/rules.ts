export const MAX_CHARS = 42;

// Expanded lists for better linguistic detection
const ARTICLES = ["a", "an", "the"];
const SUBJECT_PRONOUNS = ["i", "you", "he", "she", "we", "they"];
const POSSESSIVE_PRONOUNS = ["my", "your", "his", "her", "our", "their"];
const DEMONSTRATIVE_PRONOUNS = ["this", "that", "these", "those"];
const AUXILIARY_VERBS = ["am", "is", "are", "was", "were", "be", "been", "being", 
                         "have", "has", "had", "do", "does", "did"];
const MODAL_VERBS = ["can", "could", "will", "would", "shall", "should", 
                    "may", "might", "must"];
const CONJUNCTIONS = ["and", "but", "or", "nor", "for", "so", "yet"];
const PREPOSITIONS = ["about", "above", "across", "after", "against", "along", 
                     "among", "around", "at", "before", "behind", "below", 
                     "beneath", "beside", "between", "by", "down", "during", 
                     "except", "for", "from", "in", "inside", "into", "like", 
                     "near", "of", "off", "on", "onto", "out", "outside", 
                     "over", "past", "since", "through", "to", "toward", 
                     "under", "until", "up", "upon", "with", "within", "without"];

// Common phrasal verbs (verb + particle combinations)
const PHRASAL_VERBS = [
  "break down", "break up", "bring up", "call off", "come across", "come up with",
  "find out", "get along", "get over", "give up", "go on", "look after", 
  "look for", "look forward to", "make up", "put off", "put on", "put up with",
  "run into", "run out of", "take after", "take off", "take up", "turn down",
  "turn up", "work out"
];

// Common fixed expressions and idioms
const FIXED_EXPRESSIONS = [
  "as soon as", "as well as", "by the way", "in spite of", "in order to",
  "on the other hand", "out of the question", "sooner or later", "up to date",
  "with regard to", "in front of", "in spite of", "on account of", "as a matter of fact"
];

export function isForbiddenSplit(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  const prevLower = prev.toLowerCase();
  const nextLower = next.toLowerCase();
  
  // Article + noun (e.g., "the plan")
  if (ARTICLES.includes(prevLower)) return true;
  
  // Possessive/Demonstrative pronoun + noun (e.g., "my car", "these books")
  if (POSSESSIVE_PRONOUNS.includes(prevLower) || DEMONSTRATIVE_PRONOUNS.includes(prevLower)) return true;
  
  // Subject pronoun + verb (e.g., "I told")
  if (SUBJECT_PRONOUNS.includes(prevLower)) return true;
  
  // Auxiliary/Modal verb + main verb (e.g., "will go", "have been")
  if (AUXILIARY_VERBS.includes(prevLower) || MODAL_VERBS.includes(prevLower)) return true;
  
  // Negation from verb (e.g., "didn't know")
  if (prev.endsWith("n't") || prev.endsWith("'t")) return true;
  
  // Preposition + object (e.g., "in the house")
  if (PREPOSITIONS.includes(prevLower)) return true;
  
  // Phrasal verbs (e.g., "give up")
  if (PHRASAL_VERBS.some(pv => pv === `${prevLower} ${nextLower}`)) return true;
  
  // Fixed expressions (e.g., "as soon as")
  if (FIXED_EXPRESSIONS.some(fe => fe.includes(`${prevLower} ${nextLower}`))) return true;
  
  // Proper names (consecutive capitalized words)
  if (prev[0] === prev[0]?.toUpperCase() && next[0] === next[0]?.toUpperCase()) return true;
  
  // Numbers and units (e.g., "5 meters")
  if (/^\d+$/.test(prev) && /^[a-z]+$/.test(nextLower)) return true;
  
  // Adjective + noun when adjective is in comparative/superlative form
  if ((prevLower.endsWith("er") || prevLower.endsWith("est")) && next[0] === next[0]?.toLowerCase()) return true;
  
  return false;
}

// New function to detect if a split is preferred (good place to break)
export function isPreferredSplit(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  const nextLower = next.toLowerCase();
  
  // After punctuation
  if (/[.!?;:,]$/.test(prev)) return true;
  
  // Before conjunctions (but not after a preposition)
  if (CONJUNCTIONS.includes(nextLower)) return true;
  
  // Between independent clauses (after comma + conjunction)
  if (prev.endsWith(",") && CONJUNCTIONS.includes(nextLower)) return true;
  
  // Between sentences (after period, question mark, exclamation)
  if (/[.!?]$/.test(prev)) return true;
  
  return false;
}

// New function to calculate split quality score
export function calculateSplitQuality(prev: string, next: string): number {
  let score = 0;
  
  // Strong preference for splits after punctuation
  if (/[.!?]$/.test(prev)) score += 10;
  else if (/[;:,]$/.test(prev)) score += 5;
  
  // Preference for splits before conjunctions
  if (CONJUNCTIONS.includes(next.toLowerCase())) score += 5;
  
  // Penalty for forbidden splits
  if (isForbiddenSplit(prev, next)) score -= 20;
  
  // Penalty for very short first part
  if (prev.length < 10) score -= 5;
  
  // Bonus for balanced length (but slightly favoring second line)
  const lengthDiff = Math.abs(prev.length - next.length);
  if (lengthDiff < 5) score += 3;
  else if (lengthDiff < 10) score += 1;
  
  return score;
}