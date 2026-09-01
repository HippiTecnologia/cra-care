type GenericTable<Row extends Record<string, unknown> = Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row> & Record<string, unknown>;
  Update: Partial<Row> & Record<string, unknown>;
  Relationships: [];
};

export type SupabaseDatabase = {
  public: {
    Tables: {
      profiles: GenericTable<{ id: string; clinic_id: string | null; role: string; full_name: string; must_change_password: boolean; username: string | null }>;
      patients: GenericTable<{ id: string; clinic_id: string; auth_user_id: string | null; username: string | null; must_change_password: boolean }>;
      [table: string]: GenericTable;
    };
    Views: { [view: string]: { Row: Record<string, unknown>; Relationships: [] } };
    Functions: { [fn: string]: { Args: Record<string, unknown>; Returns: unknown } };
    Enums: { [enumName: string]: string };
    CompositeTypes: { [composite: string]: never };
  };
};
