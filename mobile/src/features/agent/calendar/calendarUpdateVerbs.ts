/** Shared update/reschedule verb patterns (RU + UA + EN). */
export const UPDATE_MUTATION_VERB =
  '(?:update|move|reschedule|shift|перенеси|перенести|перенес(?:ь|ьте)|перенос(?:ы|i)?|перемест(?:и|ь|ить)|здвинь|зсунь|посун(?:ь|уть)|посунь|змісти|измени|зміни)';

export const UPDATE_COMMAND_PREFIX = new RegExp(
  `^(?:please\\s+)?${UPDATE_MUTATION_VERB}(?:[\\s,:-]+|$)`,
  'iu',
);

export const UPDATE_WRITE_VERBS = new RegExp(UPDATE_MUTATION_VERB, 'iu');

export const RELATIVE_SHIFT_HINT =
  /(?:позже|пізніше|раньше|раніше|later|earlier|на\s+(?:\d+\s+)?(?:час|годин|hour|minute|минут|хвилин))/iu;
