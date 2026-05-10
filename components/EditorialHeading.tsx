import React from "react";
import { Platform, Text, View, ViewStyle } from "react-native";

type Props = {
  bold: string;
  italic?: string;
  size?: number;
  color?: string;
  style?: ViewStyle;
};

/**
 * Editorial headline: DM Sans bold + italic serif inline.
 * e.g. bold="What's" italic="fresh?" renders as  What's *fresh?*
 */
export function EditorialHeading({
  bold,
  italic,
  size = 30,
  color = "#1A1A17",
  style,
}: Props) {
  const serifFamily = Platform.OS === "ios" ? "Georgia" : "serif";
  return (
    <View style={style}>
      <Text
        style={{
          fontSize: size,
          lineHeight: size * 1.08,
          letterSpacing: -0.5,
          color,
          flexWrap: "wrap",
        }}
      >
        <Text style={{ fontWeight: "700" }}>{bold}</Text>
        {italic ? (
          <Text
            style={{
              fontFamily: serifFamily,
              fontStyle: "italic",
              fontWeight: "400",
            }}
          >
            {bold ? " " : ""}
            {italic}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}
