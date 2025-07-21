import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

let pool: any;
let db: any;

if (process.env.DATABASE_URL) {
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
} else {
  console.log("DATABASE_URL not found - using mock database");
  pool = {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: () => Promise.resolve(),
    end: () => Promise.resolve(),
  };

  const mockTableData = {
    competitors: [{ id: 1, name: "Competitor 1", isActive: true }, { id: 2, name: "Competitor 2", isActive: true }],
    sources: [
      { id: 1, name: "Source 1", competitorId: 1, isActive: true, lastStatus: "success", itemSelector: ".post", url: "https://example.com/competitor1", createdAt: new Date() },
      { id: 2, name: "Source 2", competitorId: 2, isActive: true, lastStatus: "success", itemSelector: ".blog", url: "https://example.com/competitor2", createdAt: new Date() }
    ],
    updates: [
      { id: 1, content: "Competitor 1 launched new feature X", sourceId: 1, competitorId: 1, scrapedAt: new Date(), severity: "medium" },
      { id: 2, content: "Competitor 2 updated pricing strategy", sourceId: 2, competitorId: 2, scrapedAt: new Date(), severity: "high" },
    ],
    classifications: [
      { id: 1, updateId: 1, competitorId: 1, category: "feature", impact: "medium", confidence: 0.85 },
      { id: 2, updateId: 2, competitorId: 2, category: "pricing", impact: "high", confidence: 0.75 },
    ],
    digests: [{ id: 1, title: "Weekly Digest", content: "Summary of competitor updates...", classifiedUpdates: [1, 2], createdAt: new Date() }]
  };

  class MockQueryBuilder {
    table: string;
    tableData: any[];
    hasJoins: boolean = false;
    selectFields: any = null;

    constructor(table: string, data: any[], fields?: any) {
      this.table = table;
      this.tableData = data;
      this.selectFields = fields;
    }

    leftJoin(...args: any[]) {
      this.hasJoins = true;
      return this;
    }

    innerJoin(...args: any[]) {
      this.hasJoins = true;
      return this;
    }

    rightJoin(...args: any[]) {
      this.hasJoins = true;
      return this;
    }

    where(...args: any[]) {
      return this;
    }

    orderBy(...args: any[]) {
      return this;
    }

    limit(...args: any[]) {
      return this;
    }

    groupBy(...args: any[]) {
      return this;
    }

    then(callback: Function) {
      let result: any[] = [];
      
      // Handle count queries
      if (this.selectFields && this.selectFields.count) {
        let count = 0;
        switch (this.table) {
          case 'competitors':
            count = mockTableData.competitors.filter(c => c.isActive).length;
            break;
          case 'sources':
            count = mockTableData.sources.filter(s => s.isActive).length;
            break;
          case 'updates':
            count = mockTableData.updates.length;
            break;
          case 'classifications':
            count = mockTableData.classifications.length;
            break;
        }
        return Promise.resolve([{ count }]);
      }

      // Handle table-specific data
      switch (this.table) {
        case 'competitors':
          result = mockTableData.competitors.filter(c => c.isActive);
          break;
        case 'sources':
          result = mockTableData.sources.filter(s => s.isActive);
          break;
        case 'updates':
          result = mockTableData.updates;
          break;
        case 'classifications':
          result = mockTableData.classifications;
          break;
        case 'digests':
          result = mockTableData.digests;
          break;
      }

      // Handle join queries - return proper structure
      if (this.hasJoins) {
        if (this.table === 'sources') {
          result = result.map((item: any) => ({
            sources: item,
            competitors: mockTableData.competitors.find(c => c.id === item.competitorId)
          }));
        } else if (this.table === 'updates') {
          result = result.map((item: any) => ({
            updates: item,
            competitors: mockTableData.competitors.find(c => c.id === item.competitorId),
            sources: mockTableData.sources.find(s => s.id === item.sourceId),
            classifications: mockTableData.classifications.find(c => c.updateId === item.id)
          }));
        }
      }

      return Promise.resolve(result);
    }

    toString() {
      return this.tableData;
    }
  }

  const mockSelect = (fields?: any) => {
    return {
      from: (table: any) => {
        let tableName = '';
        let tableData: any[] = [];

        if (table === schema.competitors) {
          tableName = 'competitors';
          tableData = mockTableData.competitors;
        } else if (table === schema.sources) {
          tableName = 'sources';
          tableData = mockTableData.sources;
        } else if (table === schema.updates) {
          tableName = 'updates';
          tableData = mockTableData.updates;
        } else if (table === schema.classifications) {
          tableName = 'classifications';
          tableData = mockTableData.classifications;
        } else if (table === schema.digests) {
          tableName = 'digests';
          tableData = mockTableData.digests;
        }

        return new MockQueryBuilder(tableName, tableData, fields);
      }
    };
  };

  const mockInsert = (table: any) => ({
    values: (values: any) => ({
      returning: () => {
        const tableName = table === schema.competitors ? 'competitors' :
                         table === schema.sources ? 'sources' :
                         table === schema.updates ? 'updates' :
                         table === schema.classifications ? 'classifications' :
                         table === schema.digests ? 'digests' : 'default';
        
        const fullValues = Array.isArray(values) 
          ? values.map((v, i) => ({ ...v, id: (mockTableData[tableName as keyof typeof mockTableData] as any[]).length + i + 1 }))
          : [{ ...values, id: (mockTableData[tableName as keyof typeof mockTableData] as any[]).length + 1 }];
        
        return Promise.resolve(fullValues);
      },
    }),
  });

  const mockUpdate = (table: any) => ({
    set: (setValues: any) => ({
      where: (whereCondition: any) => ({
        returning: () => Promise.resolve([setValues]),
      }),
    }),
  });

  const mockDelete = (table: any) => ({
    where: (whereCondition: any) => Promise.resolve([]),
  });
  
  db = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  };
}

export { pool, db };
