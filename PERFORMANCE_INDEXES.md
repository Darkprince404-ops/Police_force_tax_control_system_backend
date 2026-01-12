# Performance Indexes Documentation

## Case Model Indexes

### Existing Indexes
1. `{ case_type: 1, status: 1, case_number: 1 }` - Composite for case lookups
2. `{ status: 1, createdAt: -1 }` - Needs Attention & Recent Activity
3. `{ assigned_officer_id: 1, status: 1 }` - My Team queries
4. `{ status: 1, comeback_date: 1 }` - Overdue Comebacks

### New Indexes (Phase 2)
5. `{ status: 1, lastActivityAt: -1 }` - Aging assessments query (UnderAssessment + lastActivityAt < threshold)
6. `{ status: 1, resolvedAt: -1 }` - Resolved cases queries
7. `{ status: 1, statusChangedAt: -1 }` - Status change tracking
8. `{ lastActivityAt: 1 }` - General activity queries

## Performance Targets

### Dashboard Stats Endpoint (`/api/reports/dashboard-stats-v2`)
- **Target**: < 400ms response time on typical dataset (912 cases)
- **Optimization**: Uses unified metrics service with parallel queries
- **Indexes Used**: 
  - `{ status: 1, createdAt: -1 }` for total cases
  - `{ status: 1, resolvedAt: -1 }` for resolved count
  - `{ status: 1, comeback_date: 1 }` for overdue comebacks

### Cases List Endpoint (`/api/cases`)
- **Target**: < 200ms for filtered queries
- **Indexes Used**: Status, case_type, assigned_officer_id indexes

### Needs Attention Endpoint (`/api/cases/needs-attention`)
- **Target**: < 300ms
- **Indexes Used**:
  - `{ status: 1, comeback_date: 1 }` for overdue comebacks
  - `{ status: 1, lastActivityAt: -1 }` for aging assessments

## Query Optimization Recommendations

1. **Use aggregation pipelines** for complex metrics (already implemented)
2. **Limit result sets** - All list endpoints should support pagination
3. **Use lean() queries** - When full Mongoose documents aren't needed
4. **Parallel queries** - Use Promise.all() for independent queries (already in dashboardMetricsService)

## Monitoring

To verify index usage:
```javascript
// In MongoDB shell
db.cases.explain("executionStats").find({ status: "UnderAssessment", lastActivityAt: { $lt: new Date() } })
```

Look for:
- `executionStats.executionTimeMillis` < 100ms
- `executionStats.totalDocsExamined` should be close to `executionStats.totalDocsReturned`
- `winningPlan.stage` should be "IXSCAN" (index scan) not "COLLSCAN" (collection scan)
