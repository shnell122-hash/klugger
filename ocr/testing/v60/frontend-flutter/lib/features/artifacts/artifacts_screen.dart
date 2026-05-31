// v60 - nueva funcionalidad
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

final _artifactsProvider = FutureProvider.family<List<dynamic>, String>(
    (ref, caseId) => ApiClient().getArtifacts(caseId));

class ArtifactsScreen extends ConsumerWidget {
  final String caseId;
  const ArtifactsScreen({super.key, required this.caseId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final arts = ref.watch(_artifactsProvider(caseId));

    return Scaffold(
      backgroundColor: VilarColors.bg,
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: Row(children: [
            Text('Artefactos', style: Theme.of(context).textTheme.displayMedium),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.refresh, color: VilarColors.textMuted),
              onPressed: () => ref.invalidate(_artifactsProvider(caseId)),
            ),
          ]),
        ),
        Expanded(
          child: arts.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error:   (e, _) => Center(child: Text('$e', style: const TextStyle(color: VilarColors.accentRed))),
            data: (list) {
              if (list.isEmpty) return Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.description_outlined, size: 48, color: VilarColors.textFaint),
                  const SizedBox(height: 12),
                  Text('Sin artefactos', style: Theme.of(context).textTheme.bodyMedium),
                ]),
              );
              return ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: 4),
                itemBuilder: (_, i) => _ArtifactTile(
                  art: list[i] as Map<String, dynamic>,
                  onDeleted: () => ref.invalidate(_artifactsProvider(caseId)),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}

class _ArtifactTile extends StatelessWidget {
  final Map<String, dynamic> art;
  final VoidCallback onDeleted;
  const _ArtifactTile({required this.art, required this.onDeleted});

  static const _typeColors = {
    'html':      VilarColors.accentGreen,
    'contract':  VilarColors.accent,
    'brief':     VilarColors.accentPurple,
    'analysis':  VilarColors.accentAmber,
    'summary':   VilarColors.textMuted,
    'checklist': VilarColors.accentAmber,
  };

  static const _typeIcons = {
    'html':      Icons.html,
    'contract':  Icons.article,
    'brief':     Icons.description,
    'analysis':  Icons.analytics_outlined,
    'summary':   Icons.summarize_outlined,
    'checklist': Icons.checklist,
  };

  @override
  Widget build(BuildContext context) {
    final type  = art['artifact_type'] as String? ?? 'analysis';
    final name  = art['artifact_name'] as String? ?? 'Sin nombre';
    final id    = art['artifact_id']   as String? ?? '';
    final slug  = art['share_slug']    as String?;
    final color = _typeColors[type] ?? VilarColors.textMuted;
    final icon  = _typeIcons[type] ?? Icons.article;

    return Card(
      child: ListTile(
        leading: Container(
          width: 36, height: 36,
          decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(icon, color: color, size: 18),
        ),
        title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(type.toUpperCase(),
            style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600)),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          // Download
          IconButton(
            icon: const Icon(Icons.download, size: 16, color: VilarColors.textMuted),
            tooltip: 'Descargar',
            onPressed: () {
              final url = '${ApiClient()._dio.options.baseUrl}/api/artifacts/$id/download';
              launchUrl(Uri.parse(url));
            },
          ),
          // Share (if slug)
          if (slug != null)
            IconButton(
              icon: const Icon(Icons.share, size: 16, color: VilarColors.textMuted),
              tooltip: 'Compartir',
              onPressed: () {
                final url = 'https://ocr.ruby.lease/caso/$slug';
                launchUrl(Uri.parse(url));
              },
            ),
          // Delete
          IconButton(
            icon: const Icon(Icons.delete_outline, size: 16, color: VilarColors.accentRed),
            tooltip: 'Eliminar',
            onPressed: () async {
              final ok = await _confirmDelete(context);
              if (ok) {
                await ApiClient().deleteArtifact(id);
                onDeleted();
              }
            },
          ),
        ]),
      ),
    );
  }

  Future<bool> _confirmDelete(BuildContext context) async {
    return await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: VilarColors.surface,
            title: const Text('¿Eliminar artefacto?'),
            content: const Text('Esta acción no se puede deshacer.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: VilarColors.accentRed),
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Eliminar'),
              ),
            ],
          ),
        ) ??
        false;
  }
}
