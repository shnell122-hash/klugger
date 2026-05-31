// v60 - nueva funcionalidad
import 'package:flutter/material.dart';
import '../core/theme.dart';

class ArtifactCard extends StatelessWidget {
  final Map<String, dynamic> artifact;
  final VoidCallback? onOpen;
  final VoidCallback? onDelete;

  const ArtifactCard({
    super.key,
    required this.artifact,
    this.onOpen,
    this.onDelete,
  });

  static const _typeColor = {
    'html':      VilarColors.accentGreen,
    'contract':  VilarColors.accent,
    'brief':     VilarColors.accentPurple,
    'analysis':  VilarColors.accentAmber,
    'summary':   VilarColors.textMuted,
    'checklist': VilarColors.accentAmber,
  };

  static const _typeIcon = {
    'html':      Icons.html,
    'contract':  Icons.article,
    'brief':     Icons.description,
    'analysis':  Icons.analytics_outlined,
    'summary':   Icons.summarize_outlined,
    'checklist': Icons.checklist,
  };

  @override
  Widget build(BuildContext context) {
    final type  = artifact['artifact_type'] as String? ?? 'analysis';
    final name  = artifact['artifact_name'] as String? ?? 'Sin nombre';
    final color = _typeColor[type] ?? VilarColors.textMuted;
    final icon  = _typeIcon[type] ?? Icons.article;

    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: Theme.of(context).textTheme.titleLarge,
                      maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(3),
                    ),
                    child: Text(type.toUpperCase(),
                        style: TextStyle(fontSize: 9, color: color, fontWeight: FontWeight.w600,
                            letterSpacing: 0.6)),
                  ),
                ],
              ),
            ),
            if (onDelete != null)
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 16, color: VilarColors.textFaint),
                onPressed: onDelete,
              ),
          ]),
        ),
      ),
    );
  }
}
