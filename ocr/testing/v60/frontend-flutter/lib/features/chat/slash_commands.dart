// v60 - nueva funcionalidad
// Hint bar para slash commands mientras el usuario escribe
import 'package:flutter/material.dart';
import '../../core/theme.dart';

const _commands = [
  _Cmd('/masivo',        'Generación masiva de artefactos en lote',              '📦'),
  _Cmd('/materialidad',  'Análisis de materialidad fiscal/contractual (69-B CFF)','⚖️'),
  _Cmd('/grafico',       'Grafo de relaciones del expediente',                   '🕸️'),
  _Cmd('/evidencia',     'Genera imágenes de capacitación para el expediente',   '🖼️'),
  _Cmd('/ultra',         'Fuerza modelo ultra-barato (Llama/Qwen) para la tarea','⚡'),
  _Cmd('/sonnet',        'Fuerza Claude Sonnet para la tarea',                   '🧠'),
];

class _Cmd {
  final String cmd, desc, icon;
  const _Cmd(this.cmd, this.desc, this.icon);
}

class SlashHintBar extends StatelessWidget {
  final String query;
  const SlashHintBar({super.key, required this.query});

  @override
  Widget build(BuildContext context) {
    final q = query.toLowerCase();
    final filtered = _commands.where((c) => c.cmd.startsWith(q)).toList();
    if (filtered.isEmpty) return const SizedBox.shrink();

    return Container(
      decoration: const BoxDecoration(
        color: VilarColors.surface,
        border: Border(top: BorderSide(color: VilarColors.border)),
      ),
      constraints: const BoxConstraints(maxHeight: 200),
      child: ListView(
        shrinkWrap: true,
        children: filtered.map((c) => ListTile(
          dense: true,
          leading: Text(c.icon, style: const TextStyle(fontSize: 16)),
          title: Text(c.cmd, style: const TextStyle(
              fontSize: 13, color: VilarColors.accent, fontWeight: FontWeight.w600)),
          subtitle: Text(c.desc, style: const TextStyle(fontSize: 11, color: VilarColors.textMuted)),
          onTap: () {},   // El campo de texto ya tiene el texto — onTap completa si se desea
        )).toList(),
      ),
    );
  }
}
