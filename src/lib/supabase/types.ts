type GenericTable<Row extends Record<string, unknown> = Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row> & Record<string, unknown>;
  Update: Partial<Row> & Record<string, unknown>;
  Relationships: [];
};

export type SupabaseDatabase = {
  public: {
    Tables: {
      profiles: GenericTable<{ id: string; clinic_id: string | null; role: string; full_name: string; crm: string | null; specialty: string | null; must_change_password: boolean; username: string | null }>;
      patients: GenericTable<{ id: string; clinic_id: string; auth_user_id: string | null; username: string | null; must_change_password: boolean; full_name: string; cpf: string; birth_date: string; phone: string | null; email: string | null; status: string; doctor_profile_id: string | null; address: Record<string, string>; treatment: Record<string, string | number>; financial: Record<string, string | number> }>;
      [table: string]: GenericTable;
    };
    Views: { [view: string]: { Row: Record<string, unknown>; Relationships: [] } };
    Functions: { [fn: string]: { Args: Record<string, unknown>; Returns: unknown } };
    Enums: { [enumName: string]: string };
    CompositeTypes: { [composite: string]: never };
  };
};
