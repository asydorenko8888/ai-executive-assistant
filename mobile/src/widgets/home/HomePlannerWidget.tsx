import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from '@/src/components/ui/AppButton';
import { GlassCard } from '@/src/components/ui/GlassCard';
import { SectionTitle } from '@/src/components/ui/SectionTitle';
import type { ReminderItem } from '@/src/entities/reminder/types';
import type { TaskItem } from '@/src/entities/task/types';
import type { ActiveReminderAlert } from '@/src/features/reminders/useReminderMonitor';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type HomePlannerWidgetProps = {
  reminderDraft: string;
  onReminderDraftChange: (value: string) => void;
  reminderOffsetMinutes: number;
  onReminderOffsetChange: (value: number) => void;
  onCreateReminder: () => void | Promise<void>;
  taskDraft: string;
  onTaskDraftChange: (value: string) => void;
  onCreateTask: () => void | Promise<void>;
  reminders: ReminderItem[];
  activeReminderAlerts?: ActiveReminderAlert[];
  onDismissReminderAlert?: (reminderId: string) => void;
  reminderHistory: ReminderItem[];
  tasks: TaskItem[];
  isSubmitting: boolean;
  onCompleteReminder: (reminderId: string, title: string) => void | Promise<void>;
  onCompleteTask: (taskId: string, title: string) => void | Promise<void>;
};

const reminderTimePresets = [
  { label: '30m', value: 30 },
  { label: '2h', value: 120 },
  { label: 'Tonight', value: 480 },
  { label: 'Tomorrow', value: 960 },
];

export function HomePlannerWidget({
  reminderDraft,
  onReminderDraftChange,
  reminderOffsetMinutes,
  onReminderOffsetChange,
  onCreateReminder,
  taskDraft,
  onTaskDraftChange,
  onCreateTask,
  reminders,
  activeReminderAlerts = [],
  onDismissReminderAlert,
  reminderHistory,
  tasks,
  isSubmitting,
  onCompleteReminder,
  onCompleteTask,
}: HomePlannerWidgetProps) {
  return (
    <GlassCard>
      <SectionTitle
        title="Daily Companion"
        subtitle="Local reminders, tasks, and day control"
        icon="checkbox-outline"
        iconColor={colors.accentPurpleSoft}
        iconBackgroundColor={colors.overlayPurpleSoft}
      />

      <View style={styles.composerGroup}>
        <Text style={styles.composerLabel}>Quick reminder</Text>
        <TextInput
          value={reminderDraft}
          onChangeText={onReminderDraftChange}
          editable={!isSubmitting}
          placeholder="Pay rent, call lawyer, send file..."
          placeholderTextColor={colors.textSubtle}
          style={styles.input}
        />
        <View style={styles.presetRow}>
          {reminderTimePresets.map((preset) => {
            const isActive = preset.value === reminderOffsetMinutes;

            return (
              <Pressable
                key={preset.value}
                accessibilityRole="button"
                accessibilityLabel={`Schedule reminder in ${preset.label}`}
                onPress={() => onReminderOffsetChange(preset.value)}
                style={({ pressed }) => [
                  styles.presetButton,
                  isActive && styles.presetButtonActive,
                  pressed && styles.presetButtonPressed,
                ]}>
                <Text style={[styles.presetLabel, isActive && styles.presetLabelActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <AppButton
          title="Create Reminder"
          onPress={() => {
            void onCreateReminder();
          }}
          disabled={isSubmitting || reminderDraft.trim().length === 0}
        />
      </View>

      <View style={styles.composerGroup}>
        <Text style={styles.composerLabel}>Quick task</Text>
        <TextInput
          value={taskDraft}
          onChangeText={onTaskDraftChange}
          editable={!isSubmitting}
          placeholder="Draft investor note, prepare docs, book meeting..."
          placeholderTextColor={colors.textSubtle}
          style={styles.input}
        />
        <AppButton
          title="Save Task"
          variant="secondary"
          onPress={() => {
            void onCreateTask();
          }}
          disabled={isSubmitting || taskDraft.trim().length === 0}
        />
      </View>

      {activeReminderAlerts.length > 0 ? (
        <View style={styles.alertGroup}>
          {activeReminderAlerts.map((alert) => (
            <View key={alert.id} style={styles.alertCard}>
              <View style={styles.alertCopy}>
                <Text style={styles.alertKicker}>Reminder now</Text>
                <Text style={styles.alertTitle}>{alert.title}</Text>
              </View>
              {onDismissReminderAlert ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss reminder ${alert.title}`}
                  onPress={() => onDismissReminderAlert(alert.id)}
                  style={({ pressed }) => [styles.alertDismiss, pressed && styles.rowActionPressed]}>
                  <Text style={styles.alertDismissLabel}>Dismiss</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.listGroup}>
        <Text style={styles.groupTitle}>Upcoming reminders</Text>
        {reminders.length > 0 ? (
          reminders.slice(0, 4).map((reminder) => (
            <View key={reminder.id} style={styles.rowCard}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{reminder.title}</Text>
                <Text style={styles.rowMeta}>
                  {new Date(reminder.scheduledFor).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Complete reminder ${reminder.title}`}
                onPress={() => {
                  void onCompleteReminder(reminder.id, reminder.title);
                }}
                style={({ pressed }) => [styles.rowAction, pressed && styles.rowActionPressed]}>
                <Text style={styles.rowActionLabel}>Done</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={styles.emptyCopy}>No reminders yet. Add one to make the day less slippery.</Text>
        )}
      </View>

      <View style={styles.listGroup}>
        <Text style={styles.groupTitle}>Active tasks</Text>
        {tasks.length > 0 ? (
          tasks.slice(0, 4).map((task) => (
            <View key={task.id} style={styles.rowCard}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{task.title}</Text>
                <Text style={styles.rowMeta}>
                  {task.priority === 'critical' || task.priority === 'high'
                    ? `${task.priority} priority`
                    : 'Open local task'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Complete task ${task.title}`}
                onPress={() => {
                  void onCompleteTask(task.id, task.title);
                }}
                style={({ pressed }) => [styles.rowAction, pressed && styles.rowActionPressed]}>
                <Text style={styles.rowActionLabel}>Done</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={styles.emptyCopy}>No tasks yet. Capture one next step before it floats away.</Text>
        )}
      </View>

      {reminderHistory.length > 0 ? (
        <View style={styles.listGroup}>
          <Text style={styles.groupTitle}>Recent reminder history</Text>
          {reminderHistory.slice(0, 3).map((reminder) => (
            <View key={reminder.id} style={styles.historyRow}>
              <Text style={styles.historyTitle}>{reminder.title}</Text>
              <Text style={styles.historyMeta}>
                Completed
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  composerGroup: {
    gap: spacing.sm,
  },
  composerLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  input: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  presetButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.overlaySurface,
  },
  presetButtonActive: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.overlayBlueSoft,
  },
  presetButtonPressed: {
    opacity: 0.92,
  },
  presetLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  presetLabelActive: {
    color: colors.textPrimary,
  },
  alertGroup: {
    gap: spacing.sm,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.overlayGold,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  alertCopy: {
    flex: 1,
    gap: 4,
  },
  alertKicker: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  alertTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  alertDismiss: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  alertDismissLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  listGroup: {
    gap: spacing.sm,
  },
  groupTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  rowMeta: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  rowAction: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlaySurface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  rowActionPressed: {
    opacity: 0.9,
  },
  rowActionLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  emptyCopy: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  historyTitle: {
    flex: 1,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  historyMeta: {
    color: colors.textSubtle,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
  },
});
