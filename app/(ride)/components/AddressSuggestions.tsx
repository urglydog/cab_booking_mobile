import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { MapPin } from 'lucide-react-native';

interface AddressSuggestionItem {
  text?: string;
  place_name?: string;
  description?: string;
  place_id?: string;
  geometry?: { coordinates: [number, number] };
}

interface AddressSuggestionsProps {
  suggestions: AddressSuggestionItem[];
  activeSearch: 'pickup' | 'dropoff' | null;
  searching: boolean;
  onSelectSuggestion: (item: AddressSuggestionItem) => void;
}

export default function AddressSuggestions({
  suggestions,
  activeSearch,
  searching,
  onSelectSuggestion,
}: AddressSuggestionsProps) {
  if (suggestions.length === 0 || !activeSearch) return null;

  return (
    <View style={styles.suggestionsContainer}>
      {searching && (
        <ActivityIndicator size="small" color="#6366F1" style={{ marginVertical: 8 }} />
      )}
      <ScrollView
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {suggestions.map((item, idx) => {
          const lng = item.geometry?.coordinates?.[0];
          const lat = item.geometry?.coordinates?.[1];
          const key = `${item.place_name ?? item.text ?? 'place'}_${lat ?? 'x'}_${lng ?? 'y'}_${idx}`;

          return (
            <TouchableOpacity
              key={key}
              style={styles.suggestionItem}
              onPress={() => onSelectSuggestion(item)}
            >
              <MapPin size={18} color="#6366F1" />
              <View style={styles.suggestionTextContainer}>
                <Text style={styles.suggestionTitle} numberOfLines={1}>
                  {item.text || (item.place_name ?? item.description ?? '').split(',')[0]}
                </Text>
                <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                  {item.place_name ?? item.description}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  suggestionsContainer: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
    marginBottom: 16,
    maxHeight: 250,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden',
  },
  scrollContent: { paddingBottom: 4 },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
    gap: 12,
  },
  suggestionTextContainer: { flex: 1 },
  suggestionTitle: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  suggestionSubtitle: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
});
