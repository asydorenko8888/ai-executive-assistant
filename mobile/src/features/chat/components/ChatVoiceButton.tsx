import { useEffect, useRef } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/src/theme';
import { createShadow } from '@/src/utils/shadow';

type ChatVoiceButtonProps = {
  onPress: () => void;
  isProcessing: boolean;
  disabled?: boolean;
};

export function ChatVoiceButton({ onPress, isProcessing, disabled = false }: ChatVoiceButtonProps) {
  const pulseAnimation = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1.06,
          duration: 950,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 0.95,
          duration: 950,
          useNativeDriver: true,
        }),
      ]),
    );

    pulseLoop.start();

    return () => {
      pulseLoop.stop();
    };
  }, [pulseAnimation]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.aura,
          {
            opacity: isProcessing ? 0.28 : 0.16,
            transform: [{ scale: pulseAnimation }],
          },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voice assistant"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.button, disabled && styles.buttonDisabled, pressed && styles.pressed]}>
        <Ionicons
          name="mic"
          size={20}
          color={disabled ? colors.textSubtle : colors.textPrimary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aura: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.overlayBlueSoft,
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...createShadow({
      color: colors.accentBlue,
      opacity: 0.18,
      radius: 18,
      offsetY: 10,
      elevation: 10,
    }),
  },
  buttonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
});
