import React from 'react';
import { useTheme } from '@rneui/themed';
import { Text, View, StyleSheet, Platform } from 'react-native';

const lightColors = {
  primary: '#007AFF',
  secondary: '#6200EA',
};

const darkColors = {
  primary: '#3498db',
  secondary: '#b3396c',
};

const EditorialHeading = ({ children, style }) => (
  <Text style={[styles.heading, style]}>{children}</Text>
);

const SectionCard = ({ children, style }) => (
  <View style={[styles.sectionCard, style]}>
    {children}
  </View>
);

const StickerPill = ({ children, style }) => (
  <View style={[styles.stickerPill, style]}>
    {children}
  </View>
);

const household = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const handleAlert = () => {
    if (Platform.OS === 'web') {
      window.alert('This is an alert');
    } else {
      // Existing logic for other platforms
    }
  };

  const handleConfirm = () => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm('Are you sure?');
      return confirm;
    } else {
      // Existing logic for other platforms
    }
  };

  return (
    <View style={styles.container}>
      <EditorialHeading style={{ fontFamily: 'DM Sans', fontWeight: 'bold' }}>
        Headline
      </EditorialHeading>
      <SectionCard style={isDark ? styles.sectionCardDark : styles.sectionCardLight}>
        {/* Content for section card */}
      </SectionCard>
      <StickerPill style={styles.stickerPill}>
        Sticker
      </StickerPill>
      <Text style={{ fontFamily: 'Georgia Serif', fontStyle: 'italic' }}>
        This is some text.
      </Text>
      <View style={styles.blob} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  heading: {
    fontSize: 24,
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionCardDark: {
    backgroundColor: darkColors.primary,
    color: '#fff',
  },
  sectionCardLight: {
    backgroundColor: lightColors.primary,
    color: '#fff',
  },
  stickerPill: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    marginBottom: 16,
  },
  blob: {
    width: 50,
    height: 50,
    backgroundColor: 'blue',
    borderRadius: 25,
    margin: 16,
  },
});

export default household;