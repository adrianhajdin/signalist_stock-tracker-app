'use client';

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import InputField from "@/components/forms/InputField";
import FooterLink from "@/components/forms/FooterLink";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { signUpWithEmail } from "@/lib/actions/auth.actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const SignUp = () => {
    const router = useRouter()
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<SignUpFormData>({
        defaultValues: { fullName: '', email: '', password: '' },
        mode: 'onBlur'
    });

    const onSubmit = async (data: SignUpFormData) => {
        const result = await signUpWithEmail(data);
        if (result.success) {
            router.push('/');
        } else {
            toast.error('Sign up failed', { description: result.error ?? 'Failed to create an account.' });
        }
    }

    return (
        <>
            <h1 className="form-title">Create an account</h1>

            <div className="space-y-5">
                <GoogleSignInButton />

                <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-700" />
                    <span className="text-xs text-gray-500">or</span>
                    <div className="flex-1 h-px bg-gray-700" />
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    <InputField
                        name="fullName"
                        label="Full Name"
                        placeholder="John Doe"
                        register={register}
                        error={errors.fullName}
                        validation={{ required: 'Full name is required', minLength: 2 }}
                    />

                    <InputField
                        name="email"
                        label="Email"
                        placeholder="contact@jsmastery.com"
                        register={register}
                        error={errors.email}
                        validation={{ required: 'Email is required', pattern: /^\w+@\w+\.\w+$/ }}
                    />

                    <InputField
                        name="password"
                        label="Password"
                        placeholder="Enter a strong password"
                        type="password"
                        register={register}
                        error={errors.password}
                        validation={{ required: 'Password is required', minLength: 8 }}
                    />

                    <Button type="submit" disabled={isSubmitting} className="yellow-btn w-full mt-5">
                        {isSubmitting ? 'Creating Account' : 'Get Started'}
                    </Button>

                    <FooterLink text="Already have an account?" linkText="Sign in" href="/sign-in" />
                </form>
            </div>
        </>
    )
}
export default SignUp;
