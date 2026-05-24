// v60 - nueva funcionalidad
// Tema oscuro premium estilo Obsidian + Notion + Figma
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// ── Paleta ────────────────────────────────────────────────────────────────────
class VilarColors {
  static const bg          = Color(0xFF0D1117);   // fondo principal
  static const surface     = Color(0xFF161B22);   // cards/paneles
  static const surfaceHigh = Color(0xFF21262D);   // hover/elevated
  static const border      = Color(0xFF30363D);   // bordes sutiles
  static const accent      = Color(0xFF58A6FF);   // azul GitHub
  static const accentGreen = Color(0xFF3FB950);   // éxito
  static const accentAmber = Color(0xFFD29922);   // advertencia
  static const accentRed   = Color(0xFFF85149);   // error
  static const accentPurple= Color(0xFFBC8CFF);   // gráfos/agentes
  static const textPrimary = Color(0xFFE6EDF3);   // texto principal
  static const textMuted   = Color(0xFF8B949E);   // texto secundario
  static const textFaint   = Color(0xFF484F58);   // placeholder
}

// ── Tema ──────────────────────────────────────────────────────────────────────
ThemeData buildVilarTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  final textTheme = GoogleFonts.interTextTheme(base.textTheme).copyWith(
    displayLarge:  GoogleFonts.inter(fontSize: 32, fontWeight: FontWeight.w700, color: VilarColors.textPrimary),
    displayMedium: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.w600, color: VilarColors.textPrimary),
    headlineMedium:GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600, color: VilarColors.textPrimary),
    titleLarge:    GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600, color: VilarColors.textPrimary),
    bodyLarge:     GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w400, color: VilarColors.textPrimary),
    bodyMedium:    GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w400, color: VilarColors.textMuted),
    labelSmall:    GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w500, color: VilarColors.textFaint, letterSpacing: 0.8),
  );

  return base.copyWith(
    colorScheme: const ColorScheme.dark(
      surface:          VilarColors.bg,
      primary:          VilarColors.accent,
      secondary:        VilarColors.accentPurple,
      error:            VilarColors.accentRed,
      onSurface:        VilarColors.textPrimary,
      onPrimary:        VilarColors.bg,
      surfaceContainerHighest: VilarColors.surfaceHigh,
    ),
    scaffoldBackgroundColor: VilarColors.bg,
    textTheme: textTheme,
    cardTheme: CardTheme(
      color: VilarColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: VilarColors.border, width: 1),
      ),
    ),
    dividerTheme: const DividerThemeData(color: VilarColors.border, thickness: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: VilarColors.surfaceHigh,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: VilarColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: VilarColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: const BorderSide(color: VilarColors.accent, width: 1.5),
      ),
      hintStyle: const TextStyle(color: VilarColors.textFaint),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: VilarColors.accent,
        foregroundColor: VilarColors.bg,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        textStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: VilarColors.accent,
        textStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: VilarColors.surfaceHigh,
      selectedColor: VilarColors.accent.withOpacity(0.2),
      labelStyle: GoogleFonts.inter(fontSize: 12, color: VilarColors.textMuted),
      side: const BorderSide(color: VilarColors.border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
    ),
    listTileTheme: const ListTileThemeData(
      tileColor: Colors.transparent,
      selectedTileColor: Color(0xFF1C2128),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: VilarColors.surface,
      foregroundColor: VilarColors.textPrimary,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: GoogleFonts.inter(
        fontSize: 15, fontWeight: FontWeight.w600, color: VilarColors.textPrimary,
      ),
      iconTheme: const IconThemeData(color: VilarColors.textMuted),
    ),
    drawerTheme: const DrawerThemeData(
      backgroundColor: VilarColors.surface,
      scrimColor: Colors.black54,
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: VilarColors.surface,
      selectedItemColor: VilarColors.accent,
      unselectedItemColor: VilarColors.textFaint,
      elevation: 0,
    ),
  );
}
