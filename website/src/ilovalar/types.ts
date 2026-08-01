export interface MobileAppEntry {
  slug: string;
  name: string;
  role: string;
  version: string;
  platform: string;
  size_mb: string;
  min_os: string;
  is_required: boolean;
  download_url: string;
  notes: string[];
  released_at: string;
}
