'use client';

import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import InputField from '@/components/forms/InputField';
import FooterLink from '@/components/forms/FooterLink';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { signInWithEmail } from "@/lib/actions/auth.actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const SignIn = () => {
    const router = useRouter()
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<SignInFormData>({
        defaultValues: { email: '', password: '' },
        mode: 'onBlur',
    });

    const onSubmit = async (data: SignInFormData) => {
        const result = await signInWithEmail(data);
        if (result.success) {
            router.push('/');
        } else {
            toast.error('Sign in failed', { description: result.error ?? 'Invalid email or password.' });
        }
    }

    return (
        <>
            <h1 className="form-title">Welcome back</h1>

            <div className="space-y-5">
                <GoogleSignInButton />

                <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-700" />
                    <span className="text-xs text-gray-500">or</span>
                    <div className="flex-1 h-px bg-gray-700" />
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
                        placeholder="Enter your password"
                        type="password"
                        register={register}
                        error={errors.password}
                        validation={{ required: 'Password is required', minLength: 8 }}
                    />

                    <Button type="submit" disabled={isSubmitting} className="yellow-btn w-full mt-5">
                        {isSubmitting ? 'Signing In' : 'Sign In'}
                    </Button>

                    <FooterLink text="Don't have an account?" linkText="Create an account" href="/sign-up" />
                </form>
            </div>
        </>
    );
};
export default SignIn;
