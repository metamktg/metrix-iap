import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { useSubmitRequestAccess } from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { COPY } from "../content";

const formSchema = z.object({
  full_name: z.string().min(1, "Full name is required").max(200),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(5, "Phone is required").max(40),
  business_type: z.enum(["Agency", "Consultant", "Freelancer"], {
    required_error: "Please select a business type",
  }),
  industry: z.string().min(1, "Industry is required").max(200),
  avg_monthly_ad_spend: z.string().min(1, "Ad spend is required").max(100),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  linkedin: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

export function RequestAccessForm() {
  const [, setLocation] = useLocation();
  const requestAccess = useSubmitRequestAccess();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      industry: "",
      avg_monthly_ad_spend: "",
      website: "",
      linkedin: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    requestAccess.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          setLocation(`/thanks?status=${data.status}&email=${encodeURIComponent(data.email)}`);
        },
      }
    );
  }

  return (
    <div className="border border-[var(--mx-border-strong)] bg-black/60 backdrop-blur rounded-2xl p-6 md:p-8 w-full max-w-lg mx-auto">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-white mb-1">{COPY.form.headline}</h3>
        <p className="text-[var(--mx-text-muted)] text-sm">{COPY.form.subheadline}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {requestAccess.error && (
            <Alert variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
              <AlertDescription>
                {requestAccess.error.data?.message ||
                  requestAccess.error.message ||
                  "Something went wrong"}
              </AlertDescription>
            </Alert>
          )}

          {/* Name — first for conversion */}
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="Jane Doe" className="bg-[var(--mx-bg-deep)] border-[var(--mx-border-soft)]" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Email — second for conversion */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="jane@agency.com" className="bg-[var(--mx-bg-deep)] border-[var(--mx-border-soft)]" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Phone + Business Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="+1 (555) 000-0000" className="bg-[var(--mx-bg-deep)] border-[var(--mx-border-soft)]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="business_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-[var(--mx-bg-deep)] border-[var(--mx-border-soft)]">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Agency">Agency</SelectItem>
                      <SelectItem value="Consultant">Consultant</SelectItem>
                      <SelectItem value="Freelancer">Freelancer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Industry */}
          <FormField
            control={form.control}
            name="industry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Industry</FormLabel>
                <FormControl>
                  <Input placeholder="E-commerce, SaaS..." className="bg-[var(--mx-bg-deep)] border-[var(--mx-border-soft)]" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Monthly Ad Spend */}
          <FormField
            control={form.control}
            name="avg_monthly_ad_spend"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Avg. Monthly Ad Spend</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-[var(--mx-bg-deep)] border-[var(--mx-border-soft)]">
                      <SelectValue placeholder="Select range" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Under $10k/mo">Under $10k/mo</SelectItem>
                    <SelectItem value="$10k–$50k/mo">$10k–$50k/mo</SelectItem>
                    <SelectItem value="$50k–$250k/mo">$50k–$250k/mo</SelectItem>
                    <SelectItem value="$250k+/mo">$250k+/mo</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Optional links */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website <span className="text-[var(--mx-text-faint)] font-normal">(Optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." className="bg-[var(--mx-bg-deep)] border-[var(--mx-border-soft)]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="linkedin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>LinkedIn <span className="text-[var(--mx-text-faint)] font-normal">(Optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="https://linkedin.com/..." className="bg-[var(--mx-bg-deep)] border-[var(--mx-border-soft)]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              className="w-full mx-primary-btn"
              disabled={requestAccess.isPending}
            >
              {requestAccess.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
              {COPY.form.button}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
