import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import type { MakrukPiece } from "../logic/makruk.types";
import { getPieceAsset } from "../assets/piece-assets";
import { Image } from "expo-image";

export interface SquareProps {
  piece: MakrukPiece | null;
  squareColor: string;
  isHighlighted: boolean;
  isSelected: boolean;
  highlightColor?: string;
  size: number;
  borderColor?: string;
  borderWidth?: number;
  onPress: () => void;
  onLongPress?: () => void;
}

const SquareComponent: React.FC<SquareProps> = ({
  piece,
  squareColor,
  isHighlighted,
  isSelected,
  highlightColor = "rgba(255, 255, 0, 0.5)",
  size,
  borderColor,
  borderWidth,
  onPress,
  onLongPress,
}) => {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.square,
        {
          width: size,
          height: size,
          backgroundColor: squareColor,
          ...(borderColor && borderWidth
            ? {
                borderColor: borderColor,
                borderWidth: borderWidth,
              }
            : {}),
        },
      ]}
    >
      {isSelected && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: highlightColor }]}
        />
      )}

      {isHighlighted && !isSelected && (
        <View
          style={[
            styles.legalMoveDot,
            { backgroundColor: "rgba(0, 255, 0, 0.4)" },
          ]}
        />
      )}

      {piece && (
        <Image
          source={getPieceAsset(piece.type, piece.color, piece.isPromoted)}
          style={styles.pieceImage}
          contentFit="contain"
          transition={0}
          cachePolicy="memory"
        />
      )}
    </Pressable>
  );
};

export const Square = React.memo(SquareComponent, (prevProps, nextProps) => {
  const pieceChanged =
    prevProps.piece?.type !== nextProps.piece?.type ||
    prevProps.piece?.color !== nextProps.piece?.color ||
    prevProps.piece?.isPromoted !== nextProps.piece?.isPromoted;

  return !(
    pieceChanged ||
    prevProps.isHighlighted !== nextProps.isHighlighted ||
    prevProps.isSelected !== nextProps.isSelected ||
    prevProps.squareColor !== nextProps.squareColor ||
    prevProps.size !== nextProps.size ||
    prevProps.highlightColor !== nextProps.highlightColor ||
    prevProps.borderColor !== nextProps.borderColor ||
    prevProps.borderWidth !== nextProps.borderWidth
  );
});

Square.displayName = "Square";

const styles = StyleSheet.create({
  square: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  pieceImage: {
    width: "85%",
    height: "85%",
  },
  legalMoveDot: {
    position: "absolute",
    width: "30%",
    height: "30%",
    borderRadius: 100,
  },
});
