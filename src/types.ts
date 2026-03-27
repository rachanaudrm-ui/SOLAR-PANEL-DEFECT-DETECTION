export interface Defect {
  type: 'Crack' | 'Dust' | 'Hotspot' | 'Broken Cell' | 'Burn Mark';
  severity: 'Minor' | 'Moderate' | 'Severe';
  confidence: number;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  description: string;
  recommendation: string;
}

export interface InspectionResult {
  id: string;
  timestamp: string;
  imageUrl: string;
  status: 'Healthy' | 'Defective';
  healthScore: number; // 0-100
  efficiencyLoss: number; // percentage
  estimatedEnergyLoss: number; // kWh/day
  defects: Defect[];
  summary: string;
  maintenanceRecommendation: string;
}

export interface DashboardStats {
  totalInspected: number;
  defectiveCount: number;
  defectTypes: Record<string, number>;
  averageHealthScore: number;
  totalEfficiencyLoss: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
