// v60 - nueva funcionalidad
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';

final dashboardProvider = FutureProvider<Map<String, dynamic>>(
    (_) => ApiClient().getDashboard());

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dash = ref.watch(dashboardProvider);

    return Scaffold(
      backgroundColor: VilarColors.bg,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: dash.when(
          loading: () => const Center(heightFactor: 8, child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: VilarColors.accentRed))),
          data: (d) => _DashboardContent(data: d),
        ),
      ),
    );
  }
}

class _DashboardContent extends StatelessWidget {
  final Map<String, dynamic> data;
  const _DashboardContent({required this.data});

  @override
  Widget build(BuildContext context) {
    final mx = NumberFormat.currency(locale: 'es_MX', symbol: '\$', decimalDigits: 2);
    final totalCost  = (data['total_cost_mxn']  as num?)?.toDouble() ?? 0;
    final totalPrice = (data['total_price_mxn'] as num?)?.toDouble() ?? 0;
    final byUser     = data['by_user'] as List? ?? [];
    final byType     = data['by_artifact_type'] as Map? ?? {};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Dashboard', style: Theme.of(context).textTheme.displayMedium),
        const SizedBox(height: 20),

        // KPI row
        Wrap(
          spacing: 12, runSpacing: 12,
          children: [
            _KpiCard(label: 'Costo total', value: mx.format(totalCost), color: VilarColors.accentRed, icon: Icons.payments),
            _KpiCard(label: 'Precio facturado', value: mx.format(totalPrice), color: VilarColors.accentGreen, icon: Icons.trending_up),
            _KpiCard(label: 'Usuarios activos', value: '${byUser.length}', color: VilarColors.accent, icon: Icons.people),
            _KpiCard(label: 'Margen', value: totalCost > 0 ? '${((totalPrice - totalCost) / totalCost * 100).toStringAsFixed(1)}%' : '—',
                color: VilarColors.accentPurple, icon: Icons.analytics),
          ],
        ),
        const SizedBox(height: 24),

        // By artifact type
        if (byType.isNotEmpty) ...[
          Text('Por tipo de artefacto', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 12),
          _TypeBreakdown(byType: byType),
          const SizedBox(height: 24),
        ],

        // By user
        if (byUser.isNotEmpty) ...[
          Text('Por usuario', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 12),
          ...byUser.map((u) => _UserRow(u: u as Map<String, dynamic>)),
        ],
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  final String label, value;
  final Color color;
  final IconData icon;
  const _KpiCard({required this.label, required this.value, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 180,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: VilarColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: VilarColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(fontSize: 11, color: VilarColors.textMuted)),
        ]),
        const SizedBox(height: 8),
        Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }
}

class _TypeBreakdown extends StatelessWidget {
  final Map byType;
  const _TypeBreakdown({required this.byType});

  static const _colors = {
    'html':      VilarColors.accentGreen,
    'contract':  VilarColors.accent,
    'brief':     VilarColors.accentPurple,
    'analysis':  VilarColors.accentAmber,
    'summary':   VilarColors.textMuted,
    'checklist': VilarColors.accentAmber,
  };

  @override
  Widget build(BuildContext context) {
    final mx = NumberFormat.currency(locale: 'es_MX', symbol: '\$', decimalDigits: 2);
    return Column(
      children: byType.entries.map((e) {
        final type  = e.key as String;
        final val   = e.value as Map;
        final cost  = (val['cost_mxn']  as num?)?.toDouble() ?? 0;
        final count = (val['count']     as num?)?.toInt()    ?? 0;
        final color = _colors[type] ?? VilarColors.textMuted;
        return Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
            const SizedBox(width: 8),
            SizedBox(width: 90, child: Text(type, style: const TextStyle(fontSize: 12, color: VilarColors.textPrimary))),
            Text('$count artefactos', style: const TextStyle(fontSize: 11, color: VilarColors.textMuted)),
            const Spacer(),
            Text(mx.format(cost), style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600)),
          ]),
        );
      }).toList(),
    );
  }
}

class _UserRow extends StatelessWidget {
  final Map<String, dynamic> u;
  const _UserRow({required this.u});

  @override
  Widget build(BuildContext context) {
    final mx    = NumberFormat.currency(locale: 'es_MX', symbol: '\$', decimalDigits: 2);
    final name  = u['name']  as String? ?? u['email'] as String? ?? '?';
    final price = (u['price_mxn'] as num?)?.toDouble() ?? 0;
    final cases = u['by_case'] as List? ?? [];

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: VilarColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: VilarColors.border),
      ),
      child: Row(children: [
        CircleAvatar(radius: 16, backgroundColor: VilarColors.accent.withOpacity(0.15),
            child: Text(name[0].toUpperCase(),
                style: const TextStyle(fontSize: 12, color: VilarColors.accent))),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            Text('${cases.length} expediente(s)',
                style: const TextStyle(fontSize: 11, color: VilarColors.textMuted)),
          ]),
        ),
        Text(mx.format(price),
            style: const TextStyle(fontSize: 13, color: VilarColors.accentGreen, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}
