import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAddUserStore } from "@/stores/use-add-user-store";
import { useAddUserService } from "@/services/users/use-add-user";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useAddAdminStore } from "@/stores/use-add-admin-store";
import { useAddPatientStore } from "@/stores/use-add-patient-store";
import { useAddDoctorStore } from "@/stores/use-add-doctor-store";
import { useAddPharmacistStore } from "@/stores/use-add-pharmacist-store";

enum UserRole {
  PATIENT = "patient",
  DOCTOR = "doctor",
  ADMIN = "admin",
  PHARMACIST = "pharmacist",
}

export const userFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .optional(),
  role: z.nativeEnum(UserRole),
});

type UserFormValues = z.infer<typeof userFormSchema>;

export const AddUserDrawer = () => {
  const { isOpen, onClose } = useAddUserStore();
  const { onOpen: onAddAdminOpen } = useAddAdminStore();
  const { onOpen: onAddPatient } = useAddPatientStore();
  const { onOpen: onAddPharmacist } = useAddPharmacistStore();
  const { onOpen: onAddDoctor } = useAddDoctorStore();

  const handler = useAddUserService();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      password: "",
      role: UserRole.PATIENT,
    },
  });

  const onSubmit = async (data: UserFormValues) => {
    try {
      await handler.mutateAsync(data);
      toast.success("New user account has been created successfully");

      switch (data.role) {
        case UserRole.ADMIN:
          onAddAdminOpen();
          break;
        case UserRole.PATIENT:
          onAddPatient();
          break;
        case UserRole.DOCTOR:
          onAddDoctor();
          break;
        case UserRole.PHARMACIST:
          onAddPharmacist();
          break;
      }
      onClose();
      form.reset();
    } catch (error) {
      toast.error("Could not create user");
    }
  };

  return (
    <Drawer direction="right" open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="right-2 top-2 bottom-2 fixed flex data-[vaul-drawer-direction=right]:sm:max-w-lg bg-gradient-to-b  from-white to-gray-50">
        <DrawerHeader className="border-b mt-2 pb-4">
          <DrawerTitle className="font-extrabold text-xl">
            Create New User
          </DrawerTitle>
        </DrawerHeader>

        <div className="py-4 overflow-y-auto">
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                placeholder="user@example.com"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-red-500 text-sm">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••"
                {...form.register("password")}
              />
              <p className="text-muted-foreground text-sm">
                Leave blank if using OAuth
              </p>
              {form.formState.errors.password && (
                <p className="text-red-500 text-sm">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            {/* Role Field */}
            <div className="space-y-2 w-full">
              <Label>User Role</Label>
              <Select
                value={form.watch("role")}
                onValueChange={(value) =>
                  form.setValue("role", value as UserRole)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(UserRole).map((role) => (
                    <SelectItem key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </form>
        </div>

        <DrawerFooter className="flex flex-col justify-end gap-3 border-t pt-4">
          <Button
            variant={"primary"}
            onClick={form.handleSubmit(onSubmit)}
            disabled={handler.isPaused}
          >
            {handler.isPending ? (
              <div className="flex items-center gap-2">
                <Loader className="animate-spin" size={16} />
                Creating...
              </div>
            ) : (
              "Create User"
            )}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
