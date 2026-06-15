/** Shared umbrella / parasol synonyms for classification. */
export const UMBRELLA_TOKEN =
  'зонт(?:ик|ика|ок|а|у)?|парасол(?:ька|я|ьк(?:у|а|и|ою)?)?|parasol|umbrella';

export const UMBRELLA_QUESTION = new RegExp(
  [
    `(?:^|[\\s,.;:!?—-])(?:${UMBRELLA_TOKEN})(?:[\\s,.;:!?—-]|$)`,
    `(?:^|[\\s,.;:!?—-])(?:нужн(?:ен|на|но|ы)?|need|take|брать|брати|взять|взяти)(?:\\s+)(?:${UMBRELLA_TOKEN})(?:[\\s,.;:!?—-]|$)`,
    `(?:^|[\\s,.;:!?—-])(?:${UMBRELLA_TOKEN})\\s+(?:нужн(?:ен|на|но|ы)?|need)`,
    `(?:^|[\\s,.;:!?—-])(?:${UMBRELLA_TOKEN})\\s+(?:брать|брати|взять|взяти|нести|carry|take)(?:\\s+(?:с|with)\\s+(?:собой|собою|me|you))?`,
    `(?:^|[\\s,.;:!?—-])(?:с|with)\\s+(?:собой|собою|me)?\\s+(?:${UMBRELLA_TOKEN})`,
    `(?:^|[\\s,.;:!?—-])(?:мне|мені|мене)\\s+(?:брать|брати|взять|взяти)\\s+(?:${UMBRELLA_TOKEN})`,
  ].join('|'),
  'iu',
);

export function isUmbrellaQuestion(transcript: string) {
  return UMBRELLA_QUESTION.test(transcript);
}
