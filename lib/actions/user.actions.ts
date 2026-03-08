'use server';

import { prisma } from '@/lib/prisma';

export const getAllUsersForNewsEmail = async () => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true },
        });
        return users.filter((user) => user.email && user.name);
    } catch (e) {
        console.error('Error fetching users for news email:', e)
        return []
    }
}
