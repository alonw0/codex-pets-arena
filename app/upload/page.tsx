import { BrandLogo } from "@/components/BrandLogo";
import { PetUploader } from "@/components/PetUploader";

export default function UploadPage() {
  return (
    <main className="center-page wide">
      <BrandLogo href="/dashboard" compact />
      <PetUploader />
    </main>
  );
}
