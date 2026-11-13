// Synthetic demo profiles shared by the user and admin apps. These are demo-only,
// internally consistent profiles; real account data must continue to come from the API.
export const DEMO_EXPEDITION_GUIDE = {
  id: "demo-admin",
  name: "Demo Admin",
  email: "demoadmin@gmail.com",
  phone: "+91 98765 00000",
  sex: "Female",
  occupation: "Expedition guide",
  trekkingCapability: "Advanced · 8 years",
  blood: "O+",
  role: "Expedition Guide",
};

export const DEMO_EXPEDITION_MEMBERS = [
  { id: "rajm-demo-1", name: "Rhea Kulkarni", email: "rhea.k@example.com", phone: "+91 98200 11221", sex: "Female", occupation: "Architect", trekkingCapability: "Intermediate · 4 treks", blood: "O+", medical: "Mild asthma — carries inhaler", ec1Name: "Meera Kulkarni", ec1Rel: "Mother", ec1Ph: "+91 98200 11222", status: "approved", isDemo: true },
  { id: "rajm-demo-2", name: "Aditya Rane", email: "aditya.rane@example.com", phone: "+91 99670 44112", sex: "Male", occupation: "Software engineer", trekkingCapability: "Advanced · 12 treks", blood: "B+", medical: "None", ec1Name: "Sunil Rane", ec1Rel: "Father", ec1Ph: "+91 99670 44113", status: "approved", isDemo: true },
  { id: "rajm-demo-3", name: "Sanya Deshpande", email: "sanya.d@example.com", phone: "+91 90040 78231", sex: "Female", occupation: "Physiotherapist", trekkingCapability: "Beginner · 2 treks", blood: "A-", medical: "Knee brace — old sprain", ec1Name: "Vikram Deshpande", ec1Rel: "Brother", ec1Ph: "+91 90040 78232", status: "approved", isDemo: true },
  { id: "rajm-demo-4", name: "Kabir Sheikh", email: "kabir.s@example.com", phone: "+91 98670 55109", sex: "Male", occupation: "Photographer", trekkingCapability: "Intermediate · 6 treks", blood: "AB+", medical: "None", ec1Name: "Farah Sheikh", ec1Rel: "Sister", ec1Ph: "+91 98670 55110", status: "approved", isDemo: true },
  { id: "rajm-demo-5", name: "Ira Menon", email: "ira.menon@example.com", phone: "+91 98330 21004", sex: "Female", occupation: "Doctor · Emergency medicine", trekkingCapability: "Advanced · 10 treks", blood: "O-", medical: "Carries EpiPen", ec1Name: "Deepa Menon", ec1Rel: "Mother", ec1Ph: "+91 98330 21005", status: "approved", isDemo: true },
];

export const DEMO_USER_PROFILE = {
  id: "demo-user",
  name: "Demo User",
  email: "demouser@gmail.com",
  phone: "+91 90000 12345",
  sex: "Male",
  occupation: "Product designer",
  trekkingCapability: "Beginner · 1 trek",
  blood: "B+",
  status: "approved",
  isDemo: true,
};
