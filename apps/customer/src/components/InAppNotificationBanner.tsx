import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  registerInAppNotificationHandler,
  type InAppNotificationPayload,
} from "../inAppNotificationBus";
import { theme } from "../theme";

const AUTO_DISMISS_MS = 5000;
const SLIDE_DISTANCE = 140;

export function InAppNotificationBannerHost() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<InAppNotificationPayload | null>(null);
  const queueRef = useRef<InAppNotificationPayload[]>([]);
  const busyRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useRef(new Animated.Value(-SLIDE_DISTANCE)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const animateOut = useCallback(
    (onDone: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -SLIDE_DISTANCE, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onDone();
      });
    },
    [opacity, translateY],
  );

  const animateIn = useCallback(() => {
    translateY.setValue(-SLIDE_DISTANCE);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      busyRef.current = false;
      setCurrent(null);
      return;
    }
    busyRef.current = true;
    setCurrent(next);
    animateIn();
    clearDismissTimer();
    dismissTimerRef.current = setTimeout(() => {
      animateOut(() => {
        setCurrent(null);
        showNext();
      });
    }, AUTO_DISMISS_MS);
  }, [animateIn, animateOut, clearDismissTimer]);

  const enqueue = useCallback(
    (payload: InAppNotificationPayload) => {
      queueRef.current.push(payload);
      if (!busyRef.current) showNext();
    },
    [showNext],
  );

  useEffect(() => {
    registerInAppNotificationHandler(enqueue);
    return () => registerInAppNotificationHandler(null);
  }, [enqueue]);

  useEffect(() => () => clearDismissTimer(), [clearDismissTimer]);

  const dismiss = useCallback(() => {
    clearDismissTimer();
    animateOut(() => {
      setCurrent(null);
      showNext();
    });
  }, [animateOut, clearDismissTimer, showNext]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -6,
      onPanResponderRelease: (_, g) => {
        if (g.dy < -24) dismiss();
      },
    }),
  ).current;

  if (!current) return null;

  const topOffset = Math.max(insets.top, Platform.OS === "android" ? 10 : 8);

  return (
    <View style={styles.host} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.bannerWrap,
          { top: topOffset, opacity, transform: [{ translateY }] },
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable
          onPress={() => {
            dismiss();
            current.onPress?.();
          }}
          style={({ pressed }) => [styles.banner, pressed && styles.bannerPressed]}
          accessibilityRole="alert"
        >
          <View style={[styles.iconCircle, { backgroundColor: `${current.iconColor}22` }]}>
            <Ionicons name={current.icon} size={22} color={current.iconColor} />
          </View>
          <View style={styles.textCol}>
            <Text style={styles.title} numberOfLines={1}>
              {current.title}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {current.message}
            </Text>
          </View>
          <Ionicons name="chevron-up" size={16} color={theme.textMutedOnLight} style={styles.hint} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  bannerWrap: {
    position: "absolute",
    left: 12,
    right: 12,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 12,
  },
  bannerPressed: { opacity: 0.92 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1 },
  title: { fontSize: 15, fontWeight: "800", color: theme.textOnLight },
  body: { fontSize: 13, color: theme.textMutedOnLight, marginTop: 2, lineHeight: 18 },
  hint: { opacity: 0.5, marginTop: -8 },
});
