import { Text, View } from 'react-native';

/**
 * Manual mock for the native date/time picker.
 *
 * The real component renders a UIDatePicker, which does not exist off-device.
 * The mock renders the value as text under the same accessibility label, so a
 * test can read what a field is showing, and registers each field's `onChange`
 * so a test can drive it by label — `__setTime('At', 7, 40)`.
 *
 * Driving it by label rather than by index matters on the schedule screen,
 * where two pickers (From and Until) sit side by side and index would silently
 * survive a reorder.
 */

interface PickerProps {
  value: Date;
  mode?: string;
  display?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  onChange?: (event: unknown, date?: Date) => void;
}

const fields = new Map<string, PickerProps>();

function clock(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export default function DateTimePicker(props: PickerProps) {
  const label = props.accessibilityLabel ?? 'time';
  fields.set(label, props);

  return (
    <View accessibilityLabel={label}>
      <Text>{`${label} ${clock(props.value)}`}</Text>
    </View>
  );
}

/** Test helper: sets one field's time, as picking it on the wheel would. */
export function __setTime(label: string, hours: number, minutes: number): void {
  const field = fields.get(label);
  if (!field) throw new Error(`No time picker labelled "${label}". Known: ${[...fields.keys()].join(', ') || 'none'}`);

  const next = new Date(field.value.getTime());
  next.setHours(hours, minutes, 0, 0);
  field.onChange?.({ type: 'set' }, next);
}

/** Test helper: what a field is currently showing, as `"09:00"`. */
export function __timeOf(label: string): string | undefined {
  const field = fields.get(label);
  return field ? clock(field.value) : undefined;
}

/** Test helper: forgets every registered field. Call alongside `jest.clearAllMocks()`. */
export function __reset(): void {
  fields.clear();
}
