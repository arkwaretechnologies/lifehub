export interface UserRole {
  id: string;
  user_id: string;
  role: string;
  branch_code: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface UserProfile {
  user_id: number;
  username: string;
  fullname: string;
  address: string | null;
  email_address: string | null;
  phone_no: string | null;
  role: string;
  branch_code: string | null;
  specialty: string | null;
  license_no: string | null;
  s2_no: string | null;
  ptr_no: string | null;
  signature_storage_path: string | null;
  created_at: string | null;
  updated_at: string | null;
}
